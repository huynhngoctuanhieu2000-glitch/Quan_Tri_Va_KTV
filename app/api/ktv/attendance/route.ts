import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { employeeId, employeeName, checkType = 'CHECK_IN', latitude, longitude, locationText, photoBase64, reason } = body;

        if (!employeeId) {
            return NextResponse.json({ success: false, error: 'Missing employeeId' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // ─── Step 1: Upload Photo if exists ────────────
        let photoUrl = null;
        if (photoBase64) {
            try {
                if (Array.isArray(photoBase64)) {
                    const urls: string[] = [];
                    for (let i = 0; i < photoBase64.length; i++) {
                        const base64Str = photoBase64[i];
                        const base64Data = base64Str.replace(/^data:image\/\w+;base64,/, "");
                        const buffer = Buffer.from(base64Data, 'base64');
                        const fileExt = base64Str.match(/^data:image\/(\w+);base64,/)?.[1] || 'jpg';
                        const fileName = `${employeeId}_${Date.now()}_${i}.${fileExt}`;
                        
                        const { data: uploadData, error: uploadError } = await supabase.storage
                            .from('attendance')
                            .upload(fileName, buffer, {
                                contentType: `image/${fileExt}`,
                                upsert: false
                            });
                            
                        if (uploadError) {
                            console.error(`❌ [Attendance] Photo upload error (idx ${i}):`, uploadError);
                        } else if (uploadData?.path) {
                            const { data: publicUrlData } = supabase.storage.from('attendance').getPublicUrl(uploadData.path);
                            urls.push(publicUrlData.publicUrl);
                        }
                    }
                    if (urls.length > 0) {
                        photoUrl = JSON.stringify(urls);
                    }
                } else {
                    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(base64Data, 'base64');
                    const fileExt = photoBase64.match(/^data:image\/(\w+);base64,/)?.[1] || 'jpg';
                    const fileName = `${employeeId}_${Date.now()}.${fileExt}`;
                    
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('attendance')
                        .upload(fileName, buffer, {
                            contentType: `image/${fileExt}`,
                            upsert: false
                        });
                        
                    if (uploadError) {
                        console.error('❌ [Attendance] Photo upload error:', uploadError);
                    } else if (uploadData?.path) {
                        const { data: publicUrlData } = supabase.storage.from('attendance').getPublicUrl(uploadData.path);
                        photoUrl = publicUrlData.publicUrl;
                    }
                }
            } catch (err) {
                 console.error('❌ [Attendance] Base64 processing error:', err);
            }
        }

        // ─── Step 2: Insert KTVAttendance (status = PENDING) ────────────
        const { data: record, error: insertError } = await supabase
            .from('KTVAttendance')
            .insert({
                employeeId,
                employeeName,
                checkType,
                latitude: latitude ?? null,
                longitude: longitude ?? null,
                locationText: locationText ?? null,
                photoUrl: photoUrl,
                reason: reason ?? null,
                status: 'PENDING',
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ [Attendance POST] Insert error:', insertError);
            return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
        }

        // ─── Step 3: Push notification to admin with GPS link ───────────
        const mapsLink = latitude && longitude
            ? ` — https://maps.google.com/?q=${latitude},${longitude}`
            : '';

        let actionText = 'yêu cầu điểm danh';
        if (checkType === 'CHECK_OUT') actionText = 'yêu cầu tan ca';
        else if (checkType === 'LATE_CHECKIN') actionText = 'điểm danh bổ sung';
        else if (checkType === 'OFF_REQUEST') actionText = 'gửi yêu cầu OFF';

        const notifMessage = `📍 ${employeeName || employeeId} ${actionText}${mapsLink} [AID:${record.id}]${reason ? ` (Lý do: ${reason})` : ''}`;

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
