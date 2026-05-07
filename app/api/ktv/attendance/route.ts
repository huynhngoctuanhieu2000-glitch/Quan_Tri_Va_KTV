import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import sharp from 'sharp';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Tạo SVG Watermark cho ảnh (Theo yêu cầu mẫu 2: To, rõ, góc trên phải)
 */
async function createWatermarkSvg(width: number, height: number, dateStr: string, timeStr: string, locationText: string) {
    // Tỉ lệ font size khoảng 3% chiều rộng ảnh, tối thiểu 24px
    const fontSize = Math.max(24, Math.floor(width * 0.035));
    const padding = Math.max(20, Math.floor(width * 0.02));
    const lineHeight = fontSize * 1.3;
    
    // Xử lý xuống dòng cho địa chỉ nếu quá dài (chia khoảng 25 ký tự/dòng)
    const maxChars = 25;
    const addrLines: string[] = [];
    if (locationText) {
        let current = '';
        locationText.split(' ').forEach(word => {
            if ((current + word).length > maxChars) {
                addrLines.push(current.trim());
                current = word + ' ';
            } else {
                current += word + ' ';
            }
        });
        if (current) addrLines.push(current.trim());
    }

    const lines = [`${dateStr} at ${timeStr}`, ...addrLines];
    const panelWidth = Math.floor(width * 0.45); // Tối đa 45% chiều rộng
    const panelHeight = lines.length * lineHeight + padding * 2;

    const textElements = lines.map((line, i) => {
        // Shadow effect bằng cách vẽ 2 lần (offset 1px) hoặc dùng filter
        return `
            <text x="${panelWidth - padding + 1}" y="${padding + fontSize + (i * lineHeight) + 1}" font-family="sans-serif" font-size="${fontSize}px" fill="rgba(0,0,0,0.5)" text-anchor="end" font-weight="900">${line}</text>
            <text x="${panelWidth - padding}" y="${padding + fontSize + (i * lineHeight)}" font-family="sans-serif" font-size="${fontSize}px" fill="white" text-anchor="end" font-weight="900">${line}</text>
        `;
    }).join('');

    return `
        <svg width="${panelWidth}" height="${panelHeight}">
            <rect x="0" y="0" width="${panelWidth}" height="${panelHeight}" fill="rgba(0,0,0,0.3)" rx="10" />
            ${textElements}
        </svg>
    `;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { employeeId, employeeName: empNameInput, checkType = 'CHECK_IN', latitude, longitude, locationText, photoBase64, reason, selectedShiftType } = body;

        if (!employeeId) {
            return NextResponse.json({ success: false, error: 'Missing employeeId' }, { status: 400 });
        }

        // Lấy IP của người dùng từ headers
        const forwardedFor = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || 'unknown');

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // ─── Step 0: Resolve Staff Code and Real Name ─────────────
        const { data: userData, error: userError } = await supabase
            .from('Users')
            .select('code, fullName')
            .eq('id', employeeId)
            .single();

        if (userError || !userData) {
            console.error('❌ [Attendance] User lookup error:', userError);
            return NextResponse.json({ success: false, error: 'Không tìm thấy thông tin nhân viên' }, { status: 404 });
        }

        const staffCode = userData.code; // Mã như NH016
        // Fallback: nếu không có mã thì dùng tên tạm, nhưng ưu tiên Mã NV theo yêu cầu
        const displayName = staffCode || userData.fullName || empNameInput || 'KTV';

        // ─── Step 0.5: Verify Wi-Fi IP (IP Whitelisting) ─────────────
        const { data: configData, error: configError } = await supabase
            .from('SystemConfigs')
            .select('value')
            .eq('key', 'spa_wifi_ips')
            .single();

        // Nếu có cấu hình dải IP (dạng array) thì mới kiểm tra
        if (!configError && configData?.value && Array.isArray(configData.value) && configData.value.length > 0) {
            const allowedIps: string[] = configData.value.map((item: any) => typeof item === 'string' ? item : item.ip).filter(Boolean);
            // Cho phép localhost (cho môi trường dev) hoặc IP phải nằm trong mảng cấu hình
            if (clientIp !== '::1' && clientIp !== '127.0.0.1' && clientIp !== 'unknown') {
                if (checkType !== 'SUDDEN_OFF' && !allowedIps.includes(clientIp)) {
                    console.error(`❌ [Attendance] IP mismatch: clientIp=${clientIp}, allowedIps=${allowedIps}`);
                    
                    // SAVE REJECTED IP TO SYSTEM CONFIGS
                    const rejectedInfo = {
                        ip: clientIp,
                        name: displayName || staffCode || employeeId,
                        time: new Date().toISOString()
                    };
                    
                    try {
                        const { data: existing } = await supabase
                            .from('SystemConfigs')
                            .select('id')
                            .eq('key', 'spa_wifi_last_rejected_ip')
                            .maybeSingle();

                        if (existing) {
                            await supabase.from('SystemConfigs').update({ value: rejectedInfo, updated_at: new Date().toISOString() }).eq('id', existing.id);
                        } else {
                            await supabase.from('SystemConfigs').insert({ 
                                key: 'spa_wifi_last_rejected_ip', 
                                value: rejectedInfo, 
                                description: 'IP vừa bị từ chối khi điểm danh gần nhất' 
                            });
                        }
                    } catch (e) {
                        console.error('Lỗi khi lưu IP từ chối:', e);
                    }

                    return NextResponse.json({ 
                        success: false, 
                        error: `Vui lòng kết nối vào mạng Wi-Fi của Spa để điểm danh! (IP của bạn: ${clientIp})` 
                    }, { status: 403 });
                }
            }
        }

        // ─── Step 1: Prepare Watermark Info ─────────────
        const nowUtc = new Date();
        const nowVn = new Date(nowUtc.getTime() + VN_OFFSET_MS);
        const dateStr = nowVn.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); // 15 Apr 2026
        const timeStr = nowVn.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        
        // ─── Step 2: Upload Photo if exists ────────────
        let photoUrl = null;
        if (photoBase64) {
            try {
                const processImage = async (base64Str: string, index?: number) => {
                    const base64Data = base64Str.replace(/^data:image\/\w+;base64,/, "");
                    let buffer: any = Buffer.from(base64Data, 'base64');
                    const fileExt = base64Str.match(/^data:image\/(\w+);base64,/)?.[1] || 'jpg';
                    const fileName = `${staffCode || 'UNKNOWN'}_${Date.now()}${index !== undefined ? `_${index}` : ''}.${fileExt}`;

                    // 🛠️ APPLY WATERMARK using sharp
                    try {
                        const image = sharp(buffer);
                        const metadata = await image.metadata();
                        if (metadata.width && metadata.height) {
                            const svg = await createWatermarkSvg(metadata.width, metadata.height, dateStr, timeStr, locationText || '');
                            buffer = (await image
                                .composite([{
                                    input: Buffer.from(svg),
                                    gravity: 'northeast', 
                                    blend: 'over'
                                }])
                                .toBuffer()) as any;
                        }
                    } catch (sharpError) {
                        console.error('❌ [Attendance] Sharp watermark error:', sharpError);
                    }
                    
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('attendance')
                        .upload(fileName, buffer as any, {
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

        // ─── Step 3: Auto-Approve Logic ─────────────────
        // Chỉnh sửa: Spa có chính sách "thoáng", mọi yêu cầu điểm danh, xin đi trễ, nghỉ đột xuất đều được đồng ý tự động
        const isAutoApprove = true;
        const finalStatus = 'CONFIRMED';

        const { data: record, error: insertError } = await supabase
            .from('KTVAttendance')
            .insert({
                employeeId,
                employeeName: displayName, // Chống dùng Tên => Dùng Mã NV
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
            return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
        }

        // ─── Step 4: TurnQueue & User Shift Update (if auto-approved) ─────
        if (isAutoApprove) {
            // Fetch day cutoff to determine the exact Business Date
            const { data: cutoffConfig } = await supabase
                .from('SystemConfigs')
                .select('value')
                .eq('key', 'spa_day_cutoff_hours')
                .maybeSingle();
            
            const cutoffHours = (cutoffConfig?.value != null) ? Number(cutoffConfig.value) : 6;
            
            // Calculate Business Date based on cutoff
            const businessNow = new Date(nowVn.getTime() - cutoffHours * 60 * 60 * 1000);
            const today = businessNow.toISOString().split('T')[0];

            if (checkType === 'CHECK_IN' || checkType === 'LATE_CHECKIN') {
                // 🔹 Active shift for User
                await supabase.from('Users').update({ isOnShift: true }).eq('id', employeeId);

                // 🔹 Update KTVShifts if selectedShiftType is provided
                if (selectedShiftType) {
                    const { data: currentActive } = await supabase
                        .from('KTVShifts')
                        .select('shiftType')
                        .eq('employeeId', employeeId)
                        .eq('status', 'ACTIVE')
                        .maybeSingle();

                    if (currentActive?.shiftType !== selectedShiftType) {
                        if (currentActive) {
                            await supabase
                                .from('KTVShifts')
                                .update({ status: 'REPLACED' })
                                .eq('employeeId', employeeId)
                                .eq('status', 'ACTIVE');
                        }

                        await supabase
                            .from('KTVShifts')
                            .insert({
                                employeeId,
                                employeeName: displayName,
                                shiftType: selectedShiftType,
                                effectiveFrom: today,
                                previousShift: currentActive?.shiftType || null,
                                reason: 'Tự chọn ca lúc điểm danh',
                                status: 'ACTIVE',
                                reviewedBy: 'SYSTEM',
                                reviewedAt: nowUtc.toISOString(),
                            });
                    }
                }

                if (staffCode) {
                    // 🔹 UPSERT into TurnQueue (using staffCode)
                    const { data: maxPosRow } = await supabase
                        .from('TurnQueue')
                        .select('queue_position')
                        .eq('date', today)
                        .order('queue_position', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    const { data: maxCheckInRow } = await supabase
                        .from('TurnQueue')
                        .select('check_in_order')
                        .eq('date', today)
                        .order('check_in_order', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    const nextPosition = (maxPosRow?.queue_position ?? 0) + 1;
                    const nextCheckIn = (maxCheckInRow?.check_in_order ?? 0) + 1;

                    const { error: turnQueueError } = await supabase
                        .from('TurnQueue')
                        .upsert({
                            employee_id: staffCode,
                            date: today,
                            queue_position: nextPosition,
                            check_in_order: nextCheckIn,
                            status: 'waiting',
                            turns_completed: 0,
                        }, { onConflict: 'employee_id,date' });

                    if (turnQueueError) {
                         console.error('❌ [TurnQueue Upsert Error]:', turnQueueError);
                    }
                } else {
                    console.error('❌ [TurnQueue Error]: staffCode is null for user ID:', employeeId);
                }
            } else if (checkType === 'CHECK_OUT' || checkType === 'SUDDEN_OFF' || checkType === 'OFF_REQUEST') {
                // 🔸 Deactivate shift for User
                await supabase.from('Users').update({ isOnShift: false }).eq('id', employeeId);

                if (staffCode) {
                    // 🔸 Set status = off trong TurnQueue (hiển thị mờ ở cuối danh sách)
                    await supabase
                        .from('TurnQueue')
                        .upsert({ 
                            employee_id: staffCode, 
                            date: today, 
                            status: 'off' 
                        }, { onConflict: 'employee_id,date' });
                }
            }
        }

        // ─── Step 5: Notifications ──────────────────────
        const mapsLink = latitude && longitude
            ? ` — https://maps.google.com/?q=${latitude},${longitude}`
            : '';

        let actionText = 'yêu cầu điểm danh';
        if (checkType === 'CHECK_OUT') actionText = 'yêu cầu tan ca';
        else if (checkType === 'LATE_CHECKIN') actionText = 'điểm danh bổ sung';
        else if (checkType === 'OFF_REQUEST') actionText = 'gửi yêu cầu OFF';
        else if (checkType === 'SUDDEN_OFF') actionText = 'xin nghỉ đột xuất';

        const autoSuffix = isAutoApprove ? ' [AUTO]' : '';
        
        // Cập nhật: Không hiển thị lý do vào thông báo (Spa thoáng)
        const notifMessage = `📍 ${displayName} ${actionText}${mapsLink} [AID:${record.id}]${autoSuffix}`;

        await supabase
            .from('StaffNotifications')
            .insert({
                type: 'CHECK_IN',
                message: notifMessage,
            });

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
