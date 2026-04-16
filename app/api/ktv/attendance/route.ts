import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import sharp from 'sharp';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Tạo SVG Watermark cho ảnh
 */
async function createWatermarkSvg(width: number, height: number, textLines: string[]) {
    // Kích thước font tỉ lệ với chiều rộng ảnh (khoảng 2-3%)
    const fontSize = Math.max(16, Math.floor(width * 0.03));
    const padding = Math.max(10, Math.floor(width * 0.02));
    const lineHeight = fontSize * 1.4;
    
    // Tính toán chiều rộng/cao của panel watermark
    const panelWidth = Math.floor(width * 0.4); // Tối đa 40% chiều rộng
    const panelHeight = textLines.length * lineHeight + padding * 2;

    const textElements = textLines.map((line, i) => {
        return `<text x="${panelWidth - padding}" y="${padding + fontSize + (i * lineHeight)}" 
                font-family="Arial, sans-serif" font-size="${fontSize}px" fill="white" 
                text-anchor="end" font-weight="bold">${line}</text>`;
    }).join('');

    return `
        <svg width="${panelWidth}" height="${panelHeight}">
            <rect x="0" y="0" width="${panelWidth}" height="${panelHeight}" fill="rgba(0,0,0,0.5)" rx="5" />
            ${textElements}
        </svg>
    `;
}

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

        // ─── Step 0: Prepare Watermark Info ─────────────
        const nowUtc = new Date();
        const nowVn = new Date(nowUtc.getTime() + VN_OFFSET_MS);
        const dateStr = nowVn.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = nowVn.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const gpsStr = latitude && longitude ? `📍 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : '';
        const locStr = locationText ? `🏛️ ${locationText.substring(0, 30)}${locationText.length > 30 ? '...' : ''}` : '';
        
        const watermarkLines = [dateStr, timeStr];
        if (gpsStr) watermarkLines.push(gpsStr);
        if (locStr) watermarkLines.push(locStr);

        // ─── Step 1: Upload Photo if exists ────────────
        let photoUrl = null;
        if (photoBase64) {
            try {
                const processImage = async (base64Str: string, index?: number) => {
                    const base64Data = base64Str.replace(/^data:image\/\w+;base64,/, "");
                    let buffer = Buffer.from(base64Data, 'base64');
                    const fileExt = base64Str.match(/^data:image\/(\w+);base64,/)?.[1] || 'jpg';
                    const fileName = `${employeeId}_${Date.now()}${index !== undefined ? `_${index}` : ''}.${fileExt}`;

                    // 🛠️ APPLY WATERMARK using sharp
                    try {
                        const image = sharp(buffer);
                        const metadata = await image.metadata();
                        if (metadata.width && metadata.height) {
                            const svg = await createWatermarkSvg(metadata.width, metadata.height, watermarkLines);
                            buffer = await image
                                .composite([{
                                    input: Buffer.from(svg),
                                    gravity: 'northeast', // Góc trên bên phải
                                    blend: 'over'
                                }])
                                .toBuffer();
                        }
                    } catch (sharpError) {
                        console.error('❌ [Attendance] Sharp watermark error:', sharpError);
                    }
                    
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('attendance')
                        .upload(fileName, buffer, {
                            contentType: `image/${fileExt}`,
                            upsert: false
                        });
                        
                    if (uploadError) {
                        console.error(`❌ [Attendance] Photo upload error:`, uploadError);
                        return null;
                    } else if (uploadData?.path) {
                        const { data: publicUrlData } = supabase.storage.from('attendance').getPublicUrl(uploadData.path);
                        return publicUrlData.publicUrl;
                    }
                    return null;
                };

                if (Array.isArray(photoBase64)) {
                    const urls: string[] = [];
                    for (let i = 0; i < photoBase64.length; i++) {
                        const url = await processImage(photoBase64[i], i);
                        if (url) urls.push(url);
                    }
                    if (urls.length > 0) photoUrl = JSON.stringify(urls);
                } else {
                    photoUrl = await processImage(photoBase64);
                }
            } catch (err) {
                 console.error('❌ [Attendance] Image processing error:', err);
            }
        }

        // ─── Step 2: Auto-Approve Logic ─────────────────
        const isAutoApprove = checkType === 'CHECK_IN' || checkType === 'CHECK_OUT';
        const finalStatus = isAutoApprove ? 'CONFIRMED' : 'PENDING';

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
                status: finalStatus,
                confirmedBy: isAutoApprove ? 'SYSTEM' : null,
                confirmedAt: isAutoApprove ? nowUtc.toISOString() : null,
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ [Attendance POST] Insert error:', insertError);
            return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
        }

        // ─── Step 3: TurnQueue Update (if auto-approved) ─────────────
        if (isAutoApprove) {
            const today = nowVn.toISOString().split('T')[0];

            if (checkType === 'CHECK_IN') {
                // Logic copy from confirm/route.ts
                const { data: existingTurn } = await supabase
                    .from('TurnQueue')
                    .select('id')
                    .eq('employee_id', employeeId)
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

                    await supabase
                        .from('TurnQueue')
                        .insert({
                            employee_id: employeeId,
                            date: today,
                            queue_position: nextPosition,
                            status: 'waiting',
                            turns_completed: 0,
                        });
                }
            } else if (checkType === 'CHECK_OUT') {
                await supabase
                    .from('TurnQueue')
                    .update({ status: 'off' })
                    .eq('employee_id', employeeId)
                    .eq('date', today);
            }
        }

        // ─── Step 4: Notifications ──────────────────────
        const mapsLink = latitude && longitude
            ? ` — https://maps.google.com/?q=${latitude},${longitude}`
            : '';

        let actionText = 'yêu cầu điểm danh';
        if (checkType === 'CHECK_OUT') actionText = 'yêu cầu tan ca';
        else if (checkType === 'LATE_CHECKIN') actionText = 'điểm danh bổ sung';
        else if (checkType === 'OFF_REQUEST') actionText = 'gửi yêu cầu OFF';

        const autoSuffix = isAutoApprove ? ' [AUTO]' : '';
        const notifMessage = `📍 ${employeeName || employeeId} ${actionText}${mapsLink} [AID:${record.id}]${reason ? ` (Lý do: ${reason})` : ''}${autoSuffix}`;

        await supabase
            .from('StaffNotifications')
            .insert({
                type: 'CHECK_IN',
                message: notifMessage,
            });

        console.log(`✅ [Attendance] ${employeeName} ${checkType} - Status: ${finalStatus}`);

        return NextResponse.json({
            success: true,
            data: record,
            status: finalStatus
        });

    } catch (error: any) {
        console.error('❌ [Attendance POST] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
