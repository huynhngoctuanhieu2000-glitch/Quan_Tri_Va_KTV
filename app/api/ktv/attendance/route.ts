import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// 🔧 CONFIG
const STORAGE_BUCKET = 'ktv-attendance-photos';
const CHECK_IN_SOUND_TYPE = 'CHECK_IN';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { employeeId, employeeName, photoBase64, latitude, longitude, locationText } = body;

        if (!employeeId || !photoBase64) {
            return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // ─── Step 1: Upload photo to Supabase Storage ───────────────────
        let photoUrl: string | null = null;
        try {
            // Convert base64 to buffer
            const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
            const photoBuffer = Buffer.from(base64Data, 'base64');
            const fileName = `${employeeId}_${Date.now()}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(fileName, photoBuffer, {
                    contentType: 'image/jpeg',
                    upsert: false,
                });

            if (uploadError) {
                console.error('❌ [Attendance] Storage upload error:', uploadError);
                // Non-fatal: continue without photo URL
            } else {
                const { data: urlData } = supabase.storage
                    .from(STORAGE_BUCKET)
                    .getPublicUrl(fileName);
                photoUrl = urlData?.publicUrl ?? null;
            }
        } catch (storageErr) {
            console.error('❌ [Attendance] Storage exception:', storageErr);
        }

        // ─── Step 2: Insert into KTVAttendance ──────────────────────────
        const { data: attendanceRecord, error: attendanceError } = await supabase
            .from('KTVAttendance')
            .insert({
                employeeId,
                employeeName,
                photoUrl,
                latitude: latitude ?? null,
                longitude: longitude ?? null,
                locationText: locationText ?? null,
            })
            .select()
            .single();

        if (attendanceError) {
            console.error('❌ [Attendance] Insert error:', attendanceError);
            return NextResponse.json({ success: false, error: attendanceError.message }, { status: 500 });
        }

        // ─── Step 3: Upsert into TurnQueue (Sổ Tua) ────────────────────
        const today = new Date().toISOString().split('T')[0];

        const { data: existingTurn } = await supabase
            .from('TurnQueue')
            .select('id')
            .eq('employee_id', employeeId)
            .eq('date', today)
            .maybeSingle();

        if (!existingTurn) {
            // Get current max queue_position for today
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
                    employee_id: employeeId,
                    date: today,
                    queue_position: nextPosition,
                    status: 'waiting',
                    turns_completed: 0,
                });

            if (turnError) {
                console.warn('⚠️ [Attendance] TurnQueue upsert failed:', turnError.message);
                // Non-fatal: attendance still recorded
            }
        }

        // ─── Step 4: Push notification to admin/reception ───────────────
        const notifMessage = `📍 ${employeeName || employeeId} đã điểm danh${locationText ? ` — ${locationText}` : ''}`;

        const { error: notifError } = await supabase
            .from('StaffNotifications')
            .insert({
                type: CHECK_IN_SOUND_TYPE,
                message: notifMessage,
                employeeId: null, // broadcast to all reception/admin
                isRead: false,
            });

        if (notifError) {
            console.warn('⚠️ [Attendance] Notification insert failed:', notifError.message);
        }

        console.log(`✅ [Attendance] ${employeeName} checked in. photoUrl: ${photoUrl}, lat: ${latitude}, lng: ${longitude}`);

        return NextResponse.json({
            success: true,
            data: attendanceRecord,
            photoUrl,
        });

    } catch (error: any) {
        console.error('❌ [Attendance] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
