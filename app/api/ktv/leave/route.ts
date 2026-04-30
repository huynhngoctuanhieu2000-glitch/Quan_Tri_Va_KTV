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
        const { employeeId, employeeName, date, dates, reason, confirmExtension, confirmSuddenOff } = body;

        const targetDates = dates || (date ? [date] : []);

        if (!employeeId || targetDates.length === 0 || !reason) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: employeeId, date/dates, reason' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        const nowUtc = new Date();
        const vnOffsetMs = 7 * 60 * 60 * 1000;
        
        const validDates: string[] = [];
        const errors: string[] = [];

        // Check deadlines and existing requests
        for (const d of targetDates) {
            // Parse leave date as VN midnight
            const [yyyy, mm, dd] = d.split('-').map(Number);
            const leaveDateVnMidnight = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0)).getTime() - vnOffsetMs;
            
            // Deadline = 19:00 ICT the day before = leave date midnight VN - 5 hours in UTC
            const deadlineMs = leaveDateVnMidnight - (5 * 60 * 60 * 1000);
            
            if (nowUtc.getTime() > deadlineMs) {
                errors.push(`Ngày ${d} đã quá hạn đăng ký (trước 19h hôm trước).`);
                continue;
            }

            // Check if existing
            const { data: existing } = await supabase
                .from('KTVLeaveRequests')
                .select('id')
                .eq('employeeId', employeeId)
                .eq('date', d)
                .neq('status', 'REJECTED')
                .maybeSingle();

            if (existing) {
                errors.push(`Ngày ${d} đã đăng ký OFF rồi.`);
                continue;
            }

            validDates.push(d);
        }

        if (validDates.length === 0) {
            return NextResponse.json(
                { success: false, error: errors.join(' ') || 'Không có ngày hợp lệ nào.' },
                { status: 400 }
            );
        }

        // --- Bắt đầu xử lý Extension (Gia hạn) ---
        // Sắp xếp ngày tăng dần để tìm ngày sớm nhất
        validDates.sort();
        const firstTargetDate = validDates[0];
        
        // Tìm ngày liền trước ngày đăng ký sớm nhất
        const firstTargetDateObj = new Date(firstTargetDate);
        firstTargetDateObj.setDate(firstTargetDateObj.getDate() - 1);
        const dayBeforeStr = firstTargetDateObj.toISOString().split('T')[0];

        // Xem ngày liền trước KTV có đang OFF không
        const { data: previousLeave } = await supabase
            .from('KTVLeaveRequests')
            .select('id')
            .eq('employeeId', employeeId)
            .eq('date', dayBeforeStr)
            .neq('status', 'REJECTED')
            .maybeSingle();

        const isExtension = !!previousLeave;
        let isSuddenOff = false;

        if (isExtension) {
            // Lấy config số lần tối đa
            const { data: config } = await supabase
                .from('SystemConfigs')
                .select('value')
                .eq('key', 'max_leave_extensions_per_month')
                .maybeSingle();
            
            const maxExtensions = config && config.value ? Number(config.value) : 1;

            // Đếm số lần gia hạn trong tháng này của KTV
            // Lấy tất cả createdAt để đếm số "lần" (cùng 1 lần submit nhiều ngày sẽ chung 1 createdAt)
            const currentMonthPrefix = firstTargetDate.substring(0, 7); // YYYY-MM
            const { data: extRecords, error: countErr } = await supabase
                .from('KTVLeaveRequests')
                .select('createdAt')
                .eq('employeeId', employeeId)
                .eq('is_extension', true)
                .gte('date', `${currentMonthPrefix}-01`)
                .lte('date', `${currentMonthPrefix}-31`)
                .neq('status', 'REJECTED');

            // Count số lần (số request gia hạn khác nhau)
            const uniqueTimestamps = new Set((extRecords || []).map(r => r.createdAt));
            const usedExtensions = uniqueTimestamps.size;
            const remainingExtensions = maxExtensions - usedExtensions;

            if (confirmSuddenOff) {
                // Đã confirm Nghỉ đột xuất -> Cho qua
                isSuddenOff = true;
            } else if (confirmExtension) {
                // Đã confirm gia hạn -> Kiểm tra xem có ăn gian gởi thẳng API không
                if (remainingExtensions <= 0) {
                    return NextResponse.json({ 
                        success: false, 
                        requireConfirmation: true,
                        type: 'SUDDEN_OFF_WARNING',
                        message: `Bạn đã hết lượt gia hạn trong tháng (${usedExtensions}/${maxExtensions}). Nếu tiếp tục, ngày nghỉ này sẽ bị tính là Nghỉ Đột Xuất.`,
                        remaining: 0
                    });
                }
            } else {
                // Chưa confirm -> Báo về Frontend yêu cầu confirm
                if (remainingExtensions > 0) {
                    return NextResponse.json({ 
                        success: false, 
                        requireConfirmation: true,
                        type: 'EXTENSION_WARNING',
                        message: `Bạn đang đăng ký gia hạn ngày nghỉ. Số lượt gia hạn còn lại trong tháng là: ${remainingExtensions} lần.`,
                        remaining: remainingExtensions
                    });
                } else {
                    return NextResponse.json({ 
                        success: false, 
                        requireConfirmation: true,
                        type: 'SUDDEN_OFF_WARNING',
                        message: `Bạn đã hết lượt gia hạn trong tháng (${usedExtensions}/${maxExtensions}). Nếu tiếp tục, ngày nghỉ này sẽ bị tính là Nghỉ Đột Xuất.`,
                        remaining: 0
                    });
                }
            }
        }
        // --- Kết thúc xử lý Extension ---

        // Insert valid requests (Auto-approved)
        const insertPayloads = validDates.map(d => ({
            employeeId,
            employeeName: employeeName || employeeId,
            date: d,
            reason,
            status: 'APPROVED',
            is_extension: isExtension,
            is_sudden_off: isSuddenOff
        }));

        const { data: records, error: insertError } = await supabase
            .from('KTVLeaveRequests')
            .insert(insertPayloads)
            .select();

        if (insertError) {
            console.error('❌ [Leave POST] Insert error:', insertError);
            return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
        }

        // Send notification
        let notifMessage = `📋 ${employeeName || employeeId} đăng ký OFF ${validDates.length} ngày (${validDates.join(', ')}) (Lý do: ${reason})`;
        if (isSuddenOff) {
            notifMessage = `⚠️ [KỶ LUẬT] ${employeeName || employeeId} đăng ký NGHỈ ĐỘT XUẤT ${validDates.length} ngày (${validDates.join(', ')}) do hết lượt gia hạn! (Lý do: ${reason})`;
        } else if (isExtension) {
            notifMessage = `📋 ${employeeName || employeeId} GIA HẠN nghỉ thêm ${validDates.length} ngày (${validDates.join(', ')}) (Lý do: ${reason})`;
        }

        const { error: notifError } = await supabase
            .from('StaffNotifications')
            .insert({ type: isSuddenOff ? 'SOS' : 'CHECK_IN', message: notifMessage });

        if (notifError) console.error('❌ [Leave] StaffNotifications insert FAILED:', notifError);

        return NextResponse.json({
            success: true,
            data: records,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        console.error('❌ [Leave POST] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/ktv/leave
 * Admin approves or rejects a leave request.
 * Body: { leaveId, action: 'APPROVE' | 'REJECT', adminId? }
 */
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { leaveId, action, adminId } = body;

        if (!leaveId || !action) {
            return NextResponse.json({ success: false, error: 'Missing leaveId or action' }, { status: 400 });
        }
        if (!['APPROVE', 'REJECT'].includes(action)) {
            return NextResponse.json({ success: false, error: 'action must be APPROVE or REJECT' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // Fetch the leave request
        const { data: leave, error: fetchError } = await supabase
            .from('KTVLeaveRequests')
            .select('*')
            .eq('id', leaveId)
            .maybeSingle();

        if (fetchError || !leave) {
            return NextResponse.json({ success: false, error: 'Leave request not found' }, { status: 404 });
        }

        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        // Update leave request status
        const { error: updateError } = await supabase
            .from('KTVLeaveRequests')
            .update({
                status: newStatus,
                reviewedBy: adminId || null,
                reviewedAt: new Date().toISOString(),
            })
            .eq('id', leaveId);

        if (updateError) {
            console.error('❌ [Leave PATCH] Update error:', updateError);
            return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
        }

        // Notify KTV about the decision
        const statusText = action === 'APPROVE' ? '✅ được duyệt' : '❌ bị từ chối';
        const ktvMessage = `📋 Yêu cầu OFF ngày ${leave.date} đã ${statusText}.`;

        await supabase.from('StaffNotifications').insert({
            type: 'CHECK_IN',
            message: ktvMessage,
            employeeId: leave.employeeId,
            isRead: false,
        });

        console.log(`✅ [Leave PATCH] ${leave.employeeName}: ${action} for ${leave.date}`);

        return NextResponse.json({ success: true, status: newStatus });

    } catch (error: any) {
        console.error('❌ [Leave PATCH] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/ktv/leave?id=xxx
 * Admin deletes a leave request (e.g., wrong submission).
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const leaveId = searchParams.get('id');

        if (!leaveId) {
            return NextResponse.json({ success: false, error: 'Missing id param' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        const { error } = await supabase
            .from('KTVLeaveRequests')
            .delete()
            .eq('id', leaveId);

        if (error) {
            console.error('❌ [Leave DELETE] Error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        console.log(`✅ [Leave DELETE] Removed leave request: ${leaveId}`);
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('❌ [Leave DELETE] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
