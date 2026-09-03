import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { requireActiveStaff } from '@/lib/auth-server';

export async function POST(request: Request) {
  try {
    const lockedError = await requireActiveStaff();
    if (lockedError) return lockedError;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lấy thông tin KTV
    const username = (user.email || '').split('@')[0];
    const { data: dbUser } = await supabase.from('Users').select('code').ilike('username', username).single();
    const { data: staff } = dbUser ? await supabase.from('Staff').select('id, work_type').eq('id', dbUser.code).single() : { data: null };

    if (!staff) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }

    if (staff.work_type !== 'TYPE_D') {
      return NextResponse.json({ error: 'Chỉ áp dụng cho KTV TYPE_D' }, { status: 403 });
    }

    const body = await request.json();
    const { work_date, dates, type, expected_time, entries } = body;
    // Hỗ trợ payload cũ (dates, work_date) và mới (entries)
    const targetDates: string[] = dates || (work_date ? [work_date] : []);
    
    // Normalize thành dạng entry: { work_date, expected_time }
    let processedEntries: { work_date: string; expected_time: string | null }[] = [];
    if (entries && entries.length > 0) {
      processedEntries = entries;
    } else {
      processedEntries = targetDates.map(d => ({
        work_date: d,
        expected_time: type === 'WORKING' ? expected_time : null
      }));
    }

    if (processedEntries.length === 0 || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { canEditRegistration, vnNow } = await import('@/lib/vn-time');

    for (const entry of processedEntries) {
      if (!canEditRegistration(entry.work_date)) {
        return NextResponse.json({ error: `Chỉ có thể đăng ký/sửa lịch từ ngày mai trở đi.` }, { status: 400 });
      }
      
      if (type === 'WORKING') {
        if (!entry.expected_time) {
          return NextResponse.json({ error: `Vui lòng nhập giờ đến tiệm cho ngày ${entry.work_date}` }, { status: 400 });
        }
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.expected_time)) {
          return NextResponse.json({ error: `Giờ đến tiệm ngày ${entry.work_date} không hợp lệ (HH:mm)` }, { status: 400 });
        }
      }
    }

    // Lấy thông tin các ngày đã đăng ký để kiểm tra check_in_at
    const datesToUpdate = processedEntries.map(e => e.work_date);
    const { data: existingRecords } = await supabase
      .from('KTVTypeDDailyRegistration')
      .select('work_date, check_in_at, penalty_applied')
      .eq('staff_id', staff.id)
      .in('work_date', datesToUpdate);
      
    if (existingRecords) {
      for (const rec of existingRecords) {
        if (rec.check_in_at || rec.penalty_applied) {
          return NextResponse.json({ error: `Ngày ${rec.work_date} đã có check-in hoặc bị phạt, không thể sửa.` }, { status: 400 });
        }
      }
    }

    if (type === 'CANCEL') {
      const { error } = await supabase
        .from('KTVTypeDDailyRegistration')
        .delete()
        .eq('staff_id', staff.id)
        .in('work_date', datesToUpdate);
        
      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Đã hủy lịch đăng ký' });
    }

    const status = type === 'OFF' ? 'OFF_REGISTERED' : 'REGISTERED';

    const upsertData = processedEntries.map(entry => ({
        staff_id: staff.id,
        work_date: entry.work_date,
        expected_time: type === 'WORKING' ? entry.expected_time : null,
        status,
        registered_at: vnNow().toISOString()
    }));

    const { data, error } = await supabase
      .from('KTVTypeDDailyRegistration')
      .upsert(upsertData, { onConflict: 'staff_id,work_date' })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in daily-registration:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const lockedError = await requireActiveStaff();
    if (lockedError) return lockedError;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const username = (user.email || '').split('@')[0];
    const { data: dbUser } = await supabase.from('Users').select('code').ilike('username', username).single();
    const { data: staff } = dbUser ? await supabase.from('Staff').select('id, work_type').eq('id', dbUser.code).single() : { data: null };
    if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

    let query = supabase.from('KTVTypeDDailyRegistration').select('*').eq('staff_id', staff.id);
    if (from) query = query.gte('work_date', from);
    if (to) query = query.lte('work_date', to);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

