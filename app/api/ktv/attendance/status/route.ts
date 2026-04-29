import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

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

        // ─── Calculate today's date range in VN timezone (UTC+7) ───
        const nowUtc = new Date();
        const vnNow = new Date(nowUtc.getTime() + VN_OFFSET_MS);
        const vnDateStr = vnNow.toISOString().slice(0, 10); // YYYY-MM-DD in VN time
        const startOfDayUtc = new Date(`${vnDateStr}T00:00:00+07:00`).toISOString();
        const endOfDayUtc = new Date(`${vnDateStr}T23:59:59+07:00`).toISOString();

        // ─── Query today's attendance records, most recent first ───
        const { data: records, error } = await supabase
            .from('KTVAttendance')
            .select('*')
            .eq('employeeId', employeeId)
            .gte('checkedAt', startOfDayUtc)
            .lte('checkedAt', endOfDayUtc)
            .order('checkedAt', { ascending: false });

        if (error) {
            console.error('❌ [Attendance Status] Query error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // ─── Determine status from records ───
        if (!records || records.length === 0) {
            return NextResponse.json({ success: true, checkStatus: 'IDLE', record: null });
        }

        // Find the most relevant record (most recent non-rejected, or fallback)
        
        // 1. Kiểm tra xin nghỉ đột xuất
        const confirmedOff = records.find(
            (r) => r.checkType === 'SUDDEN_OFF' && r.status === 'CONFIRMED'
        );
        if (confirmedOff) {
            return NextResponse.json({ success: true, checkStatus: 'CONFIRMED', record: confirmedOff });
        }

        const pendingOff = records.find(
            (r) => r.checkType === 'SUDDEN_OFF' && r.status === 'PENDING'
        );
        if (pendingOff) {
            return NextResponse.json({ success: true, checkStatus: 'PENDING', record: pendingOff });
        }

        // 2. Kiểm tra Tan ca
        const confirmedCheckOut = records.find(
            (r) => r.checkType === 'CHECK_OUT' && r.status === 'CONFIRMED'
        );
        if (confirmedCheckOut) {
            return NextResponse.json({ success: true, checkStatus: 'CHECKED_OUT', record: confirmedCheckOut });
        }

        const pendingCheckOut = records.find(
            (r) => r.checkType === 'CHECK_OUT' && r.status === 'PENDING'
        );
        if (pendingCheckOut) {
            return NextResponse.json({ success: true, checkStatus: 'PENDING', record: pendingCheckOut });
        }

        // 3. Kiểm tra Vào ca
        const confirmedCheckIn = records.find(
            (r) => (r.checkType === 'CHECK_IN' || r.checkType === 'LATE_CHECKIN') && r.status === 'CONFIRMED'
        );
        if (confirmedCheckIn) {
            return NextResponse.json({ success: true, checkStatus: 'CONFIRMED', record: confirmedCheckIn });
        }

        const pendingCheckIn = records.find(
            (r) => (r.checkType === 'CHECK_IN' || r.checkType === 'LATE_CHECKIN') && r.status === 'PENDING'
        );
        if (pendingCheckIn) {
            return NextResponse.json({ success: true, checkStatus: 'PENDING', record: pendingCheckIn });
        }

        // All records are REJECTED → allow retry
        return NextResponse.json({ success: true, checkStatus: 'IDLE', record: null });

    } catch (error: any) {
        console.error('❌ [Attendance Status] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
