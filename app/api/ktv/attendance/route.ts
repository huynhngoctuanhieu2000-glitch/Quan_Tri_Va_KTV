import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { employeeId, employeeName, checkType = 'CHECK_IN', latitude, longitude, locationText } = body;

        if (!employeeId) {
            return NextResponse.json({ success: false, error: 'Missing employeeId' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // ─── Step 1: Insert KTVAttendance (status = PENDING) ────────────
        const { data: record, error: insertError } = await supabase
            .from('KTVAttendance')
            .insert({
                employeeId,
                employeeName,
                checkType,
                latitude: latitude ?? null,
                longitude: longitude ?? null,
                locationText: locationText ?? null,
                status: 'PENDING',
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ [Attendance POST] Insert error:', insertError);
            return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
        }

        // ─── Step 2: Push notification to admin with GPS link ───────────
        const mapsLink = latitude && longitude
            ? ` — https://maps.google.com/?q=${latitude},${longitude}`
            : '';

        const isCheckIn = checkType === 'CHECK_IN';
        const notifMessage = isCheckIn
            ? `📍 ${employeeName || employeeId} yêu cầu điểm danh${mapsLink}`
            : `🏁 ${employeeName || employeeId} yêu cầu tan ca${mapsLink}`;

        // Store attendanceId in bookingId field for confirm API to use
        await supabase.from('StaffNotifications').insert({
            type: 'CHECK_IN',
            message: notifMessage,
            bookingId: record.id,    // dùng bookingId để truyền attendanceId
            employeeId: null,        // broadcast to admin/reception
            isRead: false,
        });

        console.log(`✅ [Attendance] ${employeeName} requested ${checkType}. lat: ${latitude}, lng: ${longitude}`);

        return NextResponse.json({ success: true, data: record });

    } catch (error: any) {
        console.error('❌ [Attendance POST] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
