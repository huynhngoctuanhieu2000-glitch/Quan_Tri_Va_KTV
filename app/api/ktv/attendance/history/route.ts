import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * GET /api/ktv/attendance/history
 * Returns today's CONFIRMED + REJECTED attendance records for admin review.
 */
export async function GET() {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // Get today in VN timezone
        const nowVnMs = Date.now() + VN_OFFSET_MS;
        const today = new Date(nowVnMs).toISOString().split('T')[0];
        const startOfDay = `${today}T00:00:00+07:00`;
        const endOfDay = `${today}T23:59:59+07:00`;

        const { data, error } = await supabase
            .from('KTVAttendance')
            .select('id, employeeId, employeeName, checkType, status, checkedAt, confirmedAt, confirmedBy, latitude, longitude, photoUrl')
            .in('status', ['CONFIRMED', 'REJECTED'])
            .gte('checkedAt', startOfDay)
            .lte('checkedAt', endOfDay)
            .order('confirmedAt', { ascending: false });

        if (error) {
            console.error('❌ [Attendance History] Query error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: data || [] });

    } catch (error: any) {
        console.error('❌ [Attendance History] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
