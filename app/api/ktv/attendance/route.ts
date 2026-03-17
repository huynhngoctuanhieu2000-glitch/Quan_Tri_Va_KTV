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
        // Encode attendanceId into message as [AID:uuid] tag so the toast can extract it
        // NOTE: cannot use bookingId column — it's a FK to Bookings table
        const notifMessage = isCheckIn
            ? `📍 ${employeeName || employeeId} yêu cầu điểm danh${mapsLink} [AID:${record.id}]`
            : `🏁 ${employeeName || employeeId} yêu cầu tan ca${mapsLink} [AID:${record.id}]`;

        const { data: notifData, error: notifError } = await supabase
            .from('StaffNotifications')
            .insert({
                type: 'CHECK_IN',
                message: notifMessage,
                // bookingId intentionally omitted — it's a FK to Bookings table
                // employeeId omitted → null = broadcast to admin/reception
            })
            .select()
            .single();

        if (notifError) {
            // Non-fatal but log clearly for debugging
            console.error('❌ [Attendance] StaffNotifications insert FAILED:', JSON.stringify(notifError));
        } else {
            console.log('✅ [Attendance] StaffNotifications inserted, id:', notifData?.id);
        }

        console.log(`✅ [Attendance] ${employeeName} requested ${checkType}. lat: ${latitude}, lng: ${longitude}`);

        return NextResponse.json({
            success: true,
            data: record,
            notifSent: !notifError,
            notifError: notifError?.message ?? null,
        });


    } catch (error: any) {
        console.error('❌ [Attendance POST] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
