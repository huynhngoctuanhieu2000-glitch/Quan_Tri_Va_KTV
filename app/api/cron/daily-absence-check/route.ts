import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { KtvTypeDDisciplineService } from '@/lib/services/KtvTypeDDisciplineService';
import { format } from 'date-fns';
import { createNotification } from '@/lib/notification-helper';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    // Basic auth check if needed, typically crons use Authorization header with a secret
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
    }

    // Thời gian chốt sổ (VN time)
    const nowUtc = new Date();
    const nowVn = new Date(nowUtc.getTime() + VN_OFFSET_MS);
    const todayStr = format(nowVn, 'yyyy-MM-dd'); // Ngày chạy cron

    // Lấy danh sách KTV TYPE_D
    const { data: staffList, error: staffError } = await supabase
      .from('Staff')
      .select('id, status, work_type, created_at, full_name')
      .eq('work_type', 'TYPE_D')
      .neq('status', 'KHÓA_TÀI_KHOẢN'); // Bỏ qua những người đã khóa

    if (staffError || !staffList) {
      throw staffError || new Error('No TYPE_D staff found');
    }

    let processedCount = 0;
    const lockedStaffs = [];

    for (const staff of staffList) {
      if (staff.created_at) {
        const staffCreatedAtVn = new Date(new Date(staff.created_at).getTime() + VN_OFFSET_MS);
        const staffCreatedDateStr = format(staffCreatedAtVn, 'yyyy-MM-dd');
        if (staffCreatedDateStr === todayStr) {
          console.log(`Skipping new staff ${staff.id} created today`);
          continue;
        }
      }

      // 1. Kiểm tra đăng ký ngày hôm nay
      const { data: registration } = await supabase
        .from('KTVTypeDDailyRegistration')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('work_date', todayStr)
        .single();

      // Nếu KHÔNG ĐĂNG KÝ
      if (!registration) {
        // Kiểm tra xem hôm nay có đi làm thật không (vd quên đăng ký nhưng vẫn lên điểm danh)
        const { data: attendance } = await supabase
          .from('KTVAttendance')
          .select('id')
          .eq('employeeId', staff.id)
          .eq('date', todayStr)
          .in('checkType', ['CHECK_IN', 'LATE_CHECKIN'])
          .limit(1);

        if (!attendance || attendance.length === 0) {
          // KHÔNG ĐĂNG KÝ VÀ KHÔNG ĐIỂM DANH -> KHÓA TÀI KHOẢN
          console.log(`Locking account for ${staff.id} due to no registration and no attendance`);
          
          await supabase.from('SecurityAuditLogs').insert({
            employee_id: staff.id,
            employee_name: staff.full_name || staff.id,
            event_type: 'AUTO_LOCK_ABSENCE',
            ip_address: '127.0.0.1',
            user_agent: 'CRON',
            details: { source: 'CRON', violationDate: todayStr, reason: 'Không đăng ký và không điểm danh' }
          });

          await supabase.from('Staff').update({ status: 'KHÓA_TÀI_KHOẢN' }).eq('id', staff.id);
          
          await createNotification({
            type: 'EMERGENCY',
            message: `Tài khoản của bạn đã bị khóa kỷ luật do vi phạm nghỉ không phép ngày ${todayStr}.`,
            employeeId: staff.id
          });
          
          lockedStaffs.push(staff.full_name ? `${staff.full_name} (${staff.id})` : staff.id);
        }
        processedCount++;
        continue;
      }

      // 2. CÓ ĐĂNG KÝ NHƯNG KHÔNG CÓ CHECK-IN HỢP LỆ
      if (registration.status !== 'OFF_REGISTERED' && !registration.check_in_at) {
        // Tái xác nhận lại bằng KTVAttendance cho chắc ăn
        const { data: attendance } = await supabase
          .from('KTVAttendance')
          .select('id')
          .eq('employeeId', staff.id)
          .eq('date', todayStr)
          .in('checkType', ['CHECK_IN', 'LATE_CHECKIN'])
          .limit(1);

        if (!attendance || attendance.length === 0) {
          // BỊ PHẠT DO VẮNG
          let violationType: 'ABSENT_NO_NOTICE' | 'ABSENT_EARLY_NOTICE' | 'LATE_NO_UPDATE' = 'ABSENT_NO_NOTICE';
          
          if (registration.status === 'ABSENT_REPORTED' && registration.absent_reported_at) {
             const absentTimeVn = new Date(new Date(registration.absent_reported_at).getTime() + VN_OFFSET_MS);
             const absentHour = absentTimeVn.getHours();
             if (absentHour < 7) {
                 violationType = 'ABSENT_EARLY_NOTICE'; // -5h
             } else {
                 violationType = 'ABSENT_NO_NOTICE'; // -10h
             }
          } else {
             // Không báo vắng -> Bỏ lịch
             violationType = 'ABSENT_NO_NOTICE'; // -10h
          }

          if (registration.penalty_applied !== violationType) {
             console.log(`Penalizing ${staff.id} for ${violationType}`);
             await KtvTypeDDisciplineService.deductDailyViolation(
                 supabase,
                 staff.id,
                 todayStr,
                 violationType,
                 `Phạt quét cuối ngày: ${violationType}`
             );
             await supabase.from('KTVTypeDDailyRegistration').update({ penalty_applied: violationType, status: 'COMPLETED' }).eq('id', registration.id);
          }
        } else {
           // Đã điểm danh (có lẽ miss check_in_at update)
           await supabase.from('KTVTypeDDailyRegistration').update({ status: 'COMPLETED' }).eq('id', registration.id);
        }
      } else {
        await supabase.from('KTVTypeDDailyRegistration').update({ status: 'COMPLETED' }).eq('id', registration.id);
      }
      processedCount++;
    }

    if (lockedStaffs.length > 0) {
      await createNotification({
        type: 'EMERGENCY',
        message: `Hệ thống vừa khóa kỷ luật ${lockedStaffs.length} KTV do vi phạm vắng ngày ${todayStr}: ${lockedStaffs.join(', ')}`,
        employeeId: null
      });
    }

    return NextResponse.json({ success: true, processed: processedCount });
  } catch (error: any) {
    console.error('Error in daily-absence-check:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
