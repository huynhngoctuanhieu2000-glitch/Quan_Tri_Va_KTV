import { NextResponse } from 'next/server';
import { requirePermission, requireBusinessUser } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createNotification } from '@/lib/notification-helper';

export async function POST(request: Request) {
  try {
    // 1. Kiểm tra quyền Admin (cần quyền dashboard)
    // ⚠️ requirePermission trả về true khi hợp lệ và THROW khi không đủ quyền —
    // không phải trả về Response lỗi. Bắt bằng try/catch, giống app/api/reception/guest-arrival.
    try {
      await requirePermission('dashboard');
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bUser = await requireBusinessUser();
    if (!bUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { staffId, reason } = body;

    if (!staffId || !reason) {
      return NextResponse.json({ error: 'Thiếu staffId hoặc lý do (reason)' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
    }

    // 2. Kiểm tra xem staff có tồn tại và đang bị khóa không
    const { data: staff, error: staffError } = await supabase
      .from('Staff')
      .select('id, full_name, status')
      .eq('id', staffId)
      .single();

    if (staffError || !staff) {
      return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
    }

    if (staff.status !== 'KHÓA_TÀI_KHOẢN') {
      return NextResponse.json({ error: 'Nhân viên này không bị khóa tài khoản' }, { status: 400 });
    }

    // 3. Mở khóa (Set trạng thái về ĐANG LÀM)
    const { error: updateError } = await supabase
      .from('Staff')
      .update({ status: 'ĐANG LÀM' })
      .eq('id', staffId);

    if (updateError) {
      console.error('Lỗi khi mở khóa tài khoản:', updateError);
      return NextResponse.json({ error: 'Không thể mở khóa tài khoản' }, { status: 500 });
    }

    // 4. Ghi Audit Log
    await supabase.from('SecurityAuditLogs').insert({
      employee_id: staff.id,
      employee_name: staff.full_name || staff.id,
      event_type: 'MANUAL_UNLOCK',
      ip_address: '127.0.0.1',
      user_agent: 'API',
      details: { 
        unlocked_by: bUser.techCode,
        unlocked_by_id: bUser.businessUserId,
        reason: reason
      }
    });

    // 5. Gửi thông báo cho KTV
    await createNotification({
      type: 'EMERGENCY',
      message: `Tài khoản của bạn đã được mở khóa. Lý do: ${reason}`,
      employeeId: staff.id
    });

    return NextResponse.json({ success: true, message: 'Đã mở khóa tài khoản thành công' });

  } catch (error: any) {
    console.error('Error in manual staff unlock:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
