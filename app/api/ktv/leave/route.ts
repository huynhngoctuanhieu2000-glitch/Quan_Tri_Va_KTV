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
