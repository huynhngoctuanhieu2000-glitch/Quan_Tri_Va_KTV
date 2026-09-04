import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { KtvOnlineService } from '@/lib/services/KtvOnlineService';
import { resolveAttendanceStatus } from '@/lib/attendance/resolveAttendanceStatus';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * GET /api/ktv/attendance/status?employeeId=xxx
 * Returns the current attendance status for today (VN timezone).
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get('employeeId');

        if (!employeeId) {
            return NextResponse.json({ success: false, error: 'Missing employeeId' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // ─── Fetch Cut-off Time Config ───
        const { data: configData } = await supabase
            .from('SystemConfigs')
            .select('value')
            .eq('key', 'spa_day_cutoff_hours')
            .single();
            
        // Default to 6:00 AM if not set
        const cutoffHours = (configData?.value != null) ? Number(configData.value) : 6;

        // ─── Calculate Business Day date range (UTC+7) ───
        const nowUtc = new Date();
        const vnNow = new Date(nowUtc.getTime() + VN_OFFSET_MS);
        
        // Subtract cutoff hours to determine the "Business Date"
        // E.g., if cutoff is 6, 03:00 AM May 2 becomes 21:00 PM May 1 -> Business Date is May 1
        const businessNow = new Date(vnNow.getTime() - cutoffHours * 60 * 60 * 1000);
        const businessDateStr = businessNow.toISOString().slice(0, 10);
        
        // Business Day starts at cutoff hours of the business date
        const startOfBusinessDayUtc = new Date(`${businessDateStr}T${String(cutoffHours).padStart(2, '0')}:00:00+07:00`).toISOString();
        
        // Business Day ends 24 hours later (minus 1 ms for safety, but we can just add 24 hours)
        const endOfBusinessDayUtc = new Date(new Date(`${businessDateStr}T${String(cutoffHours).padStart(2, '0')}:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();

        // ─── Query today's attendance records, most recent first ───
        const { data: records, error } = await supabase
            .from('KTVAttendance')
            .select('*')
            .eq('employeeId', employeeId)
            .gte('checkedAt', startOfBusinessDayUtc)
            .lte('checkedAt', endOfBusinessDayUtc)
            .order('checkedAt', { ascending: false });

        if (error) {
            console.error('❌ [Attendance Status] Query error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // ─── Fetch Work Type & Available Until ───
        let workType = 'TYPE_A';
        let availableUntil = null;
        let lockInfo = null;
        const { data: userRow } = await supabase
            .from('Users')
            .select('code')
            .eq('id', employeeId)
            .maybeSingle();

        if (userRow?.code) {
             const { data: staffRow } = await supabase
                 .from('Staff')
                 .select('work_type, available_until, status')
                 .eq('id', userRow.code)
                 .maybeSingle();
             
             if (staffRow?.status === 'KHÓA_TÀI_KHOẢN') {
                const { data: auditLog } = await supabase
                    .from('SecurityAuditLogs')
                    .select('created_at, details, employee_name')
                    .eq('event_type', 'AUTO_LOCK_ABSENCE')
                    .eq('employee_id', userRow.code)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (auditLog) {
                    lockInfo = {
                        lockedAt: auditLog.created_at,
                        reason: auditLog.details?.reason || 'Vắng mặt không phép (Cron)',
                        adminContact: 'Hotline/Zalo Quản lý: 0987654321', 
                    };
                } else {
                    lockInfo = { lockedAt: new Date().toISOString(), reason: 'Bị khóa kỷ luật', adminContact: 'Quản lý' };
                }
             }

             if (staffRow?.work_type) {
                 workType = staffRow.work_type;
             }
             if (staffRow?.available_until) {
                 availableUntil = staffRow.available_until;
             }
        }

        // ─── Fetch Today Registration (Only for TYPE_D) ───
        let todayRegistration = null;
        // Hôm nay đã báo "yêu cầu rút tiền" chưa? Mỗi KTV chỉ báo được 1 lần/ngày,
        // nên form điểm danh phải biết mà ẩn ô tích đi — nếu không KTV bấm lại,
        // server chặn im lặng và họ tưởng đã báo thêm được.
        let withdrawIntentToday = false;
        if (workType === 'TYPE_D' && userRow?.code) {
            const { vnToday } = await import('@/lib/vn-time');
            const todayStr = vnToday();

            const { data: intentRow } = await supabase
                .from('KTVWithdrawals')
                .select('id')
                .eq('staff_id', userRow.code)
                .eq('intent_date', todayStr)
                .maybeSingle();
            withdrawIntentToday = !!intentRow;

            const { data: regData } = await supabase
                .from('KTVTypeDDailyRegistration')
                .select('status, expected_time, check_in_at, penalty_applied')
                .eq('staff_id', userRow.code)
                .eq('work_date', todayStr)
                .maybeSingle();

            if (regData) {
                todayRegistration = regData;
            }
        }

        // ─── Fetch Incomplete Tasks ───
        let incompleteTasksCount = 0;
        if (userRow?.code) {
             const { data: staffRow } = await supabase
                 .from('Staff')
                 .select('work_type')
                 .eq('id', userRow.code)
                 .maybeSingle();

             let shouldBlock = false;
             if (staffRow?.work_type) {
                 const { data: config } = await supabase
                     .from('SystemConfigs')
                     .select('value')
                     .eq('key', `block_checkout_incomplete_tasks_${staffRow.work_type}`)
                     .maybeSingle();
                 shouldBlock = !!config?.value;
             }

             if (shouldBlock) {
                 const vnDateStr = vnNow.toISOString().slice(0, 10);
                 const todayStartIso = new Date(`${vnDateStr}T00:00:00+07:00`).toISOString();

                 const { data: incompleteTasks } = await supabase
                     .from('Tasks')
                     .select('id')
                     .eq('assignee_id', userRow.code)
                     .gte('created_at', todayStartIso)
                     .neq('inspection_status', 'PASSED');
                     
                 if (incompleteTasks) {
                     incompleteTasksCount = incompleteTasks.length;
                 }
             }
        }

        // ─── Fetch Guest Arrival Lock (Only for TYPE_D) ───
        let guestArrivalLock = { active: false, lockedBy: '', lockedAt: '', message: '' };
        if (workType === 'TYPE_D') {
            const { isGuestArrivalEnabled } = await import('@/lib/guest-arrival.logic');
            const isEnabled = await isGuestArrivalEnabled(supabase);

            if (isEnabled) {
                const { data: activeLock } = await supabase
                    .from('GuestArrivalEvents')
                    .select('created_by_name, created_at, note')
                    .is('released_at', null)
                    .maybeSingle();

                if (activeLock) {
                    guestArrivalLock = {
                        active: true,
                        lockedBy: activeLock.created_by_name,
                        lockedAt: activeLock.created_at,
                        message: activeLock.note || 'Quầy vừa báo có khách. Vui lòng giữ máy.'
                    };
                }
            }
        }

        // ─── Determine status from records ───
        if (!records || records.length === 0) {
            // CƠ CHẾ BẢO VỆ: Nếu KTV chưa điểm danh hôm nay nhưng bị kẹt AT_VENUE ở bảng Staff (do quên tan ca hôm trước) -> Auto reset về OFFLINE
            if (userRow?.code) {
                const { data: staffStatus } = await supabase.from('Staff').select('online_status').eq('id', userRow.code).maybeSingle();
                if (staffStatus?.online_status === 'AT_VENUE') {
                    console.log(`[Auto-Protect] KTV ${userRow.code} stuck AT_VENUE from previous day. Resetting to OFFLINE.`);
                    await KtvOnlineService.goOffline(supabase, userRow.code);
                }
            }
            return NextResponse.json({ success: true, checkStatus: 'IDLE', record: null, workType, availableUntil, incompleteTasksCount, guestArrivalLock, lockInfo, todayRegistration, withdrawIntentToday });
        }

        const { checkStatus, record } = resolveAttendanceStatus(records, workType);
        return NextResponse.json({ success: true, checkStatus, record, workType, availableUntil, incompleteTasksCount, guestArrivalLock, lockInfo, todayRegistration, withdrawIntentToday });

    } catch (error: any) {
        console.error('❌ [Attendance Status] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
