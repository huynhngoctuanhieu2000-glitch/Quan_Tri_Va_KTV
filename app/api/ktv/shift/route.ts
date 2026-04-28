import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// 🔧 SHIFT CONFIGURATION
const SHIFT_TYPES = {
    SHIFT_1: { label: 'Ca 1', start: '09:00', end: '17:00' },
    SHIFT_2: { label: 'Ca 2', start: '11:00', end: '19:00' },
    SHIFT_3: { label: 'Ca 3', start: '17:00', end: '00:00' },
    FREE: { label: 'Ca tự do', start: '00:00', end: '23:59' },
    REQUEST: { label: 'Làm khách yêu cầu', start: '00:00', end: '23:59' },
} as const;

/**
 * GET /api/ktv/shift
 * Fetch shift data.
 * Query params:
 *   ?employeeId=xxx  — Get current shift for a specific KTV
 *   ?all=true        — Get all shifts (admin overview)
 *   ?pending=true    — Get only pending shift change requests
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get('employeeId');
        const all = searchParams.get('all');
        const pending = searchParams.get('pending');

        if (pending === 'true') {
            // Fetch only pending shift change requests (for admin)
            const { data, error } = await supabase
                .from('KTVShifts')
                .select('*')
                .eq('status', 'PENDING')
                .order('createdAt', { ascending: false });

            if (error) {
                console.error('❌ [Shift GET] Pending query error:', error);
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, data: data || [], shiftTypes: SHIFT_TYPES });
        }

        if (all === 'true') {
            // Fetch all ACTIVE shifts (admin overview)
            const { data, error } = await supabase
                .from('KTVShifts')
                .select('*')
                .eq('status', 'ACTIVE')
                .order('employeeName', { ascending: true });

            if (error) {
                console.error('❌ [Shift GET] All query error:', error);
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, data: data || [], shiftTypes: SHIFT_TYPES });
        }

        if (employeeId) {
            // Fetch current active shift + history for a specific KTV
            const { data: activeShift, error: activeError } = await supabase
                .from('KTVShifts')
                .select('*')
                .eq('employeeId', employeeId)
                .eq('status', 'ACTIVE')
                .maybeSingle();

            if (activeError) {
                console.error('❌ [Shift GET] Active shift query error:', activeError);
            }

            // Also fetch pending request if any
            const { data: pendingShift } = await supabase
                .from('KTVShifts')
                .select('*')
                .eq('employeeId', employeeId)
                .eq('status', 'PENDING')
                .maybeSingle();

            // Fetch recent history (last 10 changes)
            const { data: history } = await supabase
                .from('KTVShifts')
                .select('*')
                .eq('employeeId', employeeId)
                .in('status', ['APPROVED', 'REJECTED', 'REPLACED'])
                .order('createdAt', { ascending: false })
                .limit(10);

            return NextResponse.json({
                success: true,
                data: {
                    currentShift: activeShift || null,
                    pendingRequest: pendingShift || null,
                    history: history || [],
                },
                shiftTypes: SHIFT_TYPES,
            });
        }

        return NextResponse.json({ success: false, error: 'Missing employeeId or all param' }, { status: 400 });
    } catch (error: any) {
        console.error('❌ [Shift GET] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/ktv/shift
 * Create a shift assignment or shift change request.
 * Body: { employeeId, employeeName, shiftType, reason?, assignedByAdmin? }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { employeeId, employeeName, shiftType, reason, assignedByAdmin, adminId } = body;

        if (!employeeId || !shiftType) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: employeeId, shiftType' },
                { status: 400 }
            );
        }

        if (!['SHIFT_1', 'SHIFT_2', 'SHIFT_3', 'FREE', 'REQUEST'].includes(shiftType)) {
            return NextResponse.json(
                { success: false, error: 'Invalid shiftType. Must be SHIFT_1, SHIFT_2, SHIFT_3, FREE, or REQUEST' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // Check for existing pending request
        const { data: existingPending } = await supabase
            .from('KTVShifts')
            .select('id')
            .eq('employeeId', employeeId)
            .eq('status', 'PENDING')
            .maybeSingle();

        if (existingPending && !assignedByAdmin) {
            return NextResponse.json(
                { success: false, error: 'Bạn đã có yêu cầu đổi ca đang chờ duyệt.' },
                { status: 409 }
            );
        }

        // Get current active shift
        const { data: currentActive } = await supabase
            .from('KTVShifts')
            .select('shiftType')
            .eq('employeeId', employeeId)
            .eq('status', 'ACTIVE')
            .maybeSingle();

        if (assignedByAdmin) {
            // Admin assigns directly — mark old as REPLACED, create new ACTIVE
            if (currentActive) {
                await supabase
                    .from('KTVShifts')
                    .update({ status: 'REPLACED' })
                    .eq('employeeId', employeeId)
                    .eq('status', 'ACTIVE');
            }

            const { data: record, error: insertError } = await supabase
                .from('KTVShifts')
                .insert({
                    employeeId,
                    employeeName: employeeName || employeeId,
                    shiftType,
                    effectiveFrom: new Date().toISOString().split('T')[0],
                    previousShift: currentActive?.shiftType || null,
                    reason: reason || 'Admin gán ca',
                    status: 'ACTIVE',
                    reviewedBy: adminId || null,
                    reviewedAt: new Date().toISOString(),
                })
                .select()
                .single();

            if (insertError) {
                console.error('❌ [Shift POST] Admin insert error:', insertError);
                return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
            }

            // Notify KTV
            const shiftLabel = SHIFT_TYPES[shiftType as keyof typeof SHIFT_TYPES]?.label || shiftType;
            await supabase.from('StaffNotifications').insert({
                type: 'CHECK_IN',
                message: `📋 Bạn đã được gán ${shiftLabel} (${SHIFT_TYPES[shiftType as keyof typeof SHIFT_TYPES]?.start} - ${SHIFT_TYPES[shiftType as keyof typeof SHIFT_TYPES]?.end}).`,
                employeeId,
                isRead: false,
            });

            console.log(`✅ [Shift] Admin assigned ${shiftLabel} to ${employeeName || employeeId}`);
            return NextResponse.json({ success: true, data: record });
        }

        // KTV requests shift change — AUTO APPROVE (no admin review needed)
        if (currentActive?.shiftType === shiftType) {
            return NextResponse.json(
                { success: false, error: 'Bạn đang ở ca này rồi.' },
                { status: 400 }
            );
        }

        // 1. Mark old ACTIVE shift as REPLACED
        if (currentActive) {
            await supabase
                .from('KTVShifts')
                .update({ status: 'REPLACED' })
                .eq('employeeId', employeeId)
                .eq('status', 'ACTIVE');
        }

        // 2. Insert new shift as ACTIVE directly (auto-approved)
        const { data: record, error: insertError } = await supabase
            .from('KTVShifts')
            .insert({
                employeeId,
                employeeName: employeeName || employeeId,
                shiftType,
                effectiveFrom: new Date().toISOString().split('T')[0],
                previousShift: currentActive?.shiftType || null,
                reason: reason || '',
                status: 'ACTIVE',
                reviewedAt: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ [Shift POST] KTV insert error:', insertError);
            return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
        }

        // Notify about shift change (informational)
        const shiftLabel = SHIFT_TYPES[shiftType as keyof typeof SHIFT_TYPES]?.label || shiftType;
        const prevLabel = currentActive?.shiftType
            ? SHIFT_TYPES[currentActive.shiftType as keyof typeof SHIFT_TYPES]?.label
            : 'Chưa có';
        
        await supabase.from('StaffNotifications').insert({
            type: 'CHECK_IN',
            message: `📋 ${employeeName || employeeId} đã đổi ca: ${prevLabel} → ${shiftLabel}`,
            isRead: false,
        });

        console.log(`✅ [Shift] ${employeeName} changed shift to ${shiftLabel} (auto-approved)`);
        return NextResponse.json({ success: true, data: record });

    } catch (error: any) {
        console.error('❌ [Shift POST] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/ktv/shift
 * Admin approves or rejects a shift change request.
 * Body: { shiftId, action: 'APPROVE' | 'REJECT', adminId? }
 */
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { shiftId, action, adminId } = body;

        if (!shiftId || !action) {
            return NextResponse.json({ success: false, error: 'Missing shiftId or action' }, { status: 400 });
        }
        if (!['APPROVE', 'REJECT'].includes(action)) {
            return NextResponse.json({ success: false, error: 'action must be APPROVE or REJECT' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // Fetch the pending request
        const { data: shiftReq, error: fetchError } = await supabase
            .from('KTVShifts')
            .select('*')
            .eq('id', shiftId)
            .eq('status', 'PENDING')
            .maybeSingle();

        if (fetchError || !shiftReq) {
            return NextResponse.json({ success: false, error: 'Shift request not found or already processed' }, { status: 404 });
        }

        if (action === 'APPROVE') {
            // 1. Mark old ACTIVE shift as REPLACED
            await supabase
                .from('KTVShifts')
                .update({ status: 'REPLACED' })
                .eq('employeeId', shiftReq.employeeId)
                .eq('status', 'ACTIVE');

            // 2. Mark this request as ACTIVE (approved and now effective)
            const { error: updateError } = await supabase
                .from('KTVShifts')
                .update({
                    status: 'ACTIVE',
                    effectiveFrom: new Date().toISOString().split('T')[0],
                    reviewedBy: adminId || null,
                    reviewedAt: new Date().toISOString(),
                })
                .eq('id', shiftId);

            if (updateError) {
                console.error('❌ [Shift PATCH] Approve error:', updateError);
                return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
            }

            // Notify KTV
            const shiftLabel = SHIFT_TYPES[shiftReq.shiftType as keyof typeof SHIFT_TYPES]?.label || shiftReq.shiftType;
            await supabase.from('StaffNotifications').insert({
                type: 'CHECK_IN',
                message: `✅ Yêu cầu đổi sang ${shiftLabel} đã được duyệt!`,
                employeeId: shiftReq.employeeId,
                isRead: false,
            });

            console.log(`✅ [Shift PATCH] APPROVED: ${shiftReq.employeeName} → ${shiftLabel}`);
        } else {
            // REJECT
            const { error: updateError } = await supabase
                .from('KTVShifts')
                .update({
                    status: 'REJECTED',
                    reviewedBy: adminId || null,
                    reviewedAt: new Date().toISOString(),
                })
                .eq('id', shiftId);

            if (updateError) {
                console.error('❌ [Shift PATCH] Reject error:', updateError);
                return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
            }

            // Notify KTV
            const shiftLabel = SHIFT_TYPES[shiftReq.shiftType as keyof typeof SHIFT_TYPES]?.label || shiftReq.shiftType;
            await supabase.from('StaffNotifications').insert({
                type: 'CHECK_IN',
                message: `❌ Yêu cầu đổi sang ${shiftLabel} đã bị từ chối.`,
                employeeId: shiftReq.employeeId,
                isRead: false,
            });

            console.log(`✅ [Shift PATCH] REJECTED: ${shiftReq.employeeName} → ${shiftLabel}`);
        }

        return NextResponse.json({ success: true, action });

    } catch (error: any) {
        console.error('❌ [Shift PATCH] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
