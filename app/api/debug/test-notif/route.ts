import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Debug endpoint: Test StaffNotifications insert
 * GET /api/debug/test-notif
 */
export async function GET() {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'no supabase' }, { status: 500 });

    // 1. Check existing columns by doing a minimal select
    const { data: cols, error: colErr } = await supabase
        .from('StaffNotifications')
        .select('*')
        .limit(1);
    
    // 2. Try insert with minimal fields
    const { data: inserted, error: insertErr } = await supabase
        .from('StaffNotifications')
        .insert({
            type: 'CHECK_IN',
            message: '🧪 TEST: Điểm danh debug - nếu bạn thấy thông báo này là OK! [AID:test-123]',
        })
        .select()
        .single();

    return NextResponse.json({
        selectResult: cols,
        selectError: colErr?.message ?? null,
        insertResult: inserted,
        insertError: insertErr?.message ?? null,
        insertCode: insertErr?.code ?? null,
    });
}
