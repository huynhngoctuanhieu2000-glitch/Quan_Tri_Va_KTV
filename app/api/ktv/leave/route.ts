import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/ktv/leave
 * Fetch leave requests for all employees.
 * Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD (optional, defaults to current month)
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        
        // Default: from today, next 30 days
        const today = new Date();
        const defaultFrom = today.toISOString().split('T')[0];
        const defaultTo = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const from = searchParams.get('from') || defaultFrom;
        const to = searchParams.get('to') || defaultTo;

        const { data, error } = await supabase
            .from('KTVLeaveRequests')
            .select('*')
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: true });

        if (error) {
            console.error('❌ [Leave GET] Query error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: data || [] });
    } catch (error: any) {
        console.error('❌ [Leave GET] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/ktv/leave
 * Create a new leave request.
 * Body: { employeeId, employeeName, date, reason }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { employeeId, employeeName, date, reason } = body;

        if (!employeeId || !date || !reason) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: employeeId, date, reason' },
                { status: 400 }
            );
        }

        // ── DEADLINE CHECK: Must register before 19:00 ICT the day before ──
        // VD: OFF ngày 6/4 → phải đăng ký trước 19h ngày 5/4
        const nowUtc = new Date();
        const vnOffsetMs = 7 * 60 * 60 * 1000;
        const vnNowMs = nowUtc.getTime() + vnOffsetMs;
        
        // Parse leave date as VN midnight
        const [yyyy, mm, dd] = date.split('-').map(Number);
        const leaveDateVnMidnight = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0)).getTime() - vnOffsetMs;
        
        // Deadline = 19:00 ICT the day before = leave date midnight VN - 5 hours in UTC
        const deadlineMs = leaveDateVnMidnight - (5 * 60 * 60 * 1000); // 24h - 19h = 5h before midnight
        
        if (nowUtc.getTime() > deadlineMs) {
            return NextResponse.json(
                { success: false, error: 'Đã quá hạn đăng ký. Phải đăng ký OFF trước 19h ngày hôm trước.' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // Check if employee already requested OFF for this date
        const { data: existing } = await supabase
            .from('KTVLeaveRequests')
            .select('id')
            .eq('employeeId', employeeId)
            .eq('date', date)
            .neq('status', 'REJECTED')
            .maybeSingle();

        if (existing) {
            return NextResponse.json(
                { success: false, error: 'Bạn đã đăng ký OFF cho ngày này rồi.' },
                { status: 409 }
            );
        }

        // Insert leave request
        const { data: record, error: insertError } = await supabase
            .from('KTVLeaveRequests')
            .insert({
                employeeId,
                employeeName: employeeName || employeeId,
                date,
                reason,
                status: 'PENDING',
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ [Leave POST] Insert error:', insertError);
            return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
        }

        // Send notification to admin/reception
        const notifMessage = `📋 ${employeeName || employeeId} đăng ký OFF ngày ${date} (Lý do: ${reason})`;
        
        const { error: notifError } = await supabase
            .from('StaffNotifications')
            .insert({
                type: 'CHECK_IN',
                message: notifMessage,
            });

        if (notifError) {
            console.error('❌ [Leave] StaffNotifications insert FAILED:', JSON.stringify(notifError));
        }

        console.log(`✅ [Leave] ${employeeName} requested OFF on ${date}`);

        return NextResponse.json({
            success: true,
            data: record,
        });

    } catch (error: any) {
        console.error('❌ [Leave POST] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/ktv/leave
 * Admin approves or rejects a leave request.
 * Body: { leaveId, action: 'APPROVE' | 'REJECT', adminId? }
 */
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { leaveId, action, adminId } = body;

        if (!leaveId || !action) {
            return NextResponse.json({ success: false, error: 'Missing leaveId or action' }, { status: 400 });
        }
        if (!['APPROVE', 'REJECT'].includes(action)) {
            return NextResponse.json({ success: false, error: 'action must be APPROVE or REJECT' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // Fetch the leave request
        const { data: leave, error: fetchError } = await supabase
            .from('KTVLeaveRequests')
            .select('*')
            .eq('id', leaveId)
            .maybeSingle();

        if (fetchError || !leave) {
            return NextResponse.json({ success: false, error: 'Leave request not found' }, { status: 404 });
        }

        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        // Update leave request status
        const { error: updateError } = await supabase
            .from('KTVLeaveRequests')
            .update({
                status: newStatus,
                reviewedBy: adminId || null,
                reviewedAt: new Date().toISOString(),
            })
            .eq('id', leaveId);

        if (updateError) {
            console.error('❌ [Leave PATCH] Update error:', updateError);
            return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
        }

        // Notify KTV about the decision
        const statusText = action === 'APPROVE' ? '✅ được duyệt' : '❌ bị từ chối';
        const ktvMessage = `📋 Yêu cầu OFF ngày ${leave.date} đã ${statusText}.`;

        await supabase.from('StaffNotifications').insert({
            type: 'CHECK_IN',
            message: ktvMessage,
            employeeId: leave.employeeId,
            isRead: false,
        });

        console.log(`✅ [Leave PATCH] ${leave.employeeName}: ${action} for ${leave.date}`);

        return NextResponse.json({ success: true, status: newStatus });

    } catch (error: any) {
        console.error('❌ [Leave PATCH] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/ktv/leave?id=xxx
 * Admin deletes a leave request (e.g., wrong submission).
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const leaveId = searchParams.get('id');

        if (!leaveId) {
            return NextResponse.json({ success: false, error: 'Missing id param' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        const { error } = await supabase
            .from('KTVLeaveRequests')
            .delete()
            .eq('id', leaveId);

        if (error) {
            console.error('❌ [Leave DELETE] Error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        console.log(`✅ [Leave DELETE] Removed leave request: ${leaveId}`);
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('❌ [Leave DELETE] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
