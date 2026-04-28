import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * PATCH /api/ktv/attendance/confirm
 * Body: { attendanceId: string, action: 'CONFIRM' | 'REJECT', adminId?: string }
 * 
 * Admin confirms or rejects a PENDING attendance record.
 */
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { attendanceId, action, adminId } = body;

        if (!attendanceId || !action) {
            return NextResponse.json({ success: false, error: 'Missing attendanceId or action' }, { status: 400 });
        }
        if (!['CONFIRM', 'REJECT'].includes(action)) {
            return NextResponse.json({ success: false, error: 'action must be CONFIRM or REJECT' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // Fetch the attendance record
        const { data: attendance, error: fetchError } = await supabase
            .from('KTVAttendance')
            .select('*')
            .eq('id', attendanceId)
            .maybeSingle();

        if (fetchError || !attendance) {
            return NextResponse.json({ success: false, error: 'Attendance record not found' }, { status: 404 });
        }

        // Lấy staffCode từ Users table vì TurnQueue.employee_id lưu staffCode (vd: NH014)
        const { data: userRow } = await supabase
            .from('Users')
            .select('code')
            .eq('id', attendance.employeeId)
            .maybeSingle();
        const staffCode = userRow?.code || attendance.employeeId;

        const newStatus = action === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';

        // ─── Update KTVAttendance status ────────────────────────────────
        const { error: updateError } = await supabase
            .from('KTVAttendance')
            .update({
                status: newStatus,
                confirmedBy: adminId || null,
                confirmedAt: new Date().toISOString(),
            })
            .eq('id', attendanceId);

        if (updateError) {
            console.error('❌ [Attendance CONFIRM] Update error:', updateError);
            return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
        }

        // ─── If CONFIRMED CHECK_IN: upsert TurnQueue ────────────────────
        if (action === 'CONFIRM' && (attendance.checkType === 'CHECK_IN' || attendance.checkType === 'LATE_CHECKIN')) {
            const nowUtc = new Date();
            const nowVnMs = nowUtc.getTime() + VN_OFFSET_MS;
            const today = new Date(nowVnMs).toISOString().split('T')[0];

            const { data: existingTurn } = await supabase
                .from('TurnQueue')
                .select('id')
                .eq('employee_id', staffCode)
                .eq('date', today)
                .maybeSingle();

            if (!existingTurn) {
                const { data: maxPosRow } = await supabase
                    .from('TurnQueue')
                    .select('queue_position')
                    .eq('date', today)
                    .order('queue_position', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const nextPosition = (maxPosRow?.queue_position ?? 0) + 1;

                const { error: turnError } = await supabase
                    .from('TurnQueue')
                    .insert({
                        employee_id: staffCode,
                        date: today,
                        queue_position: nextPosition,
                        status: 'waiting',
                        turns_completed: 0,
                    });

                if (turnError) {
                    console.warn('⚠️ [Attendance CONFIRM] TurnQueue insert failed:', turnError.message);
                }
            }
        }

        // ─── If CONFIRMED CHECK_OUT: set status = off (hiển thị mờ cuối danh sách) ──────
        if (action === 'CONFIRM' && attendance.checkType === 'CHECK_OUT') {
            const nowUtc = new Date();
            const today = new Date(nowUtc.getTime() + VN_OFFSET_MS).toISOString().split('T')[0];

            await supabase
                .from('TurnQueue')
                .update({ status: 'off' })
                .eq('employee_id', staffCode)
                .eq('date', today);
        }

        // ─── Notify KTV via StaffNotifications ──────────────────────────
        const isCheckIn = attendance.checkType === 'CHECK_IN' || attendance.checkType === 'LATE_CHECKIN';
        const ktvMessage = action === 'CONFIRM'
            ? (isCheckIn ? '✅ Admin đã xác nhận điểm danh của bạn!' : '✅ Admin đã xác nhận tan ca!')
            : (isCheckIn ? '❌ Admin từ chối điểm danh. Vui lòng liên hệ quản lý.' : '❌ Admin từ chối tan ca.');

        await supabase.from('StaffNotifications').insert({
            type: 'CHECK_IN',
            message: ktvMessage,
            employeeId: attendance.employeeId,  // gán riêng cho KTV
            isRead: false,
        });

        console.log(`✅ [Attendance CONFIRM] ${attendance.employeeName}: ${action} ${attendance.checkType}`);

        return NextResponse.json({ success: true, status: newStatus });

    } catch (error: any) {
        console.error('❌ [Attendance CONFIRM] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
