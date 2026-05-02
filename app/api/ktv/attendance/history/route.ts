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

        // ─── Fetch Cut-off Time Config ───
        const { data: configData } = await supabase
            .from('SystemConfigs')
            .select('value')
            .eq('key', 'spa_day_cutoff_hours')
            .maybeSingle();
            
        const cutoffHours = (configData?.value != null) ? Number(configData.value) : 6;

        // ─── Calculate Business Day date range (UTC+7) ───
        const nowVnMs = Date.now() + VN_OFFSET_MS;
        
        // Subtract cutoff hours to determine the "Business Date"
        const businessNow = new Date(nowVnMs - cutoffHours * 60 * 60 * 1000);
        const businessDateStr = businessNow.toISOString().split('T')[0];
        
        // Business Day starts at cutoff hours of the business date
        const startOfBusinessDayUtc = new Date(`${businessDateStr}T${String(cutoffHours).padStart(2, '0')}:00:00+07:00`).toISOString();
        
        // Business Day ends 24 hours later (minus 1 ms)
        const endOfBusinessDayUtc = new Date(new Date(`${businessDateStr}T${String(cutoffHours).padStart(2, '0')}:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();

        const { data, error } = await supabase
            .from('KTVAttendance')
            .select('id, employeeId, employeeName, checkType, status, checkedAt, confirmedAt, confirmedBy, latitude, longitude, photoUrl')
            .in('status', ['CONFIRMED', 'REJECTED'])
            .gte('checkedAt', startOfBusinessDayUtc)
            .lte('checkedAt', endOfBusinessDayUtc)
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
