import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/** 18 tiêu chí chấm điểm, gom theo 3 nhóm của quy chế Loại D. */
export async function GET() {
    try {
        await requirePermission('ktv_office_scoring');

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase admin chưa được cấu hình' }, { status: 500 });
        }

        const { data, error } = await supabase
            .from('KTVOfficeCriteria')
            .select('id, grp, grp_label, label, points, requires_photo, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        if (error) throw error;

        // Gom nhóm sẵn để UI khỏi phải tự group, và tính luôn điểm tối đa mỗi nhóm.
        const groups: any[] = [];
        for (const c of data || []) {
            let g = groups.find(x => x.grp === c.grp);
            if (!g) {
                g = { grp: c.grp, label: `${c.grp}. ${c.grp_label}`, max: 0, items: [] };
                groups.push(g);
            }
            g.max += Number(c.points) || 0;
            g.items.push({
                id: c.id,
                label: c.label,
                points: Number(c.points) || 0,
                requiresPhoto: c.requires_photo,
            });
        }

        return NextResponse.json({ success: true, groups });
    } catch (error: any) {
        const msg = error?.message || 'Lỗi không xác định';
        const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
        if (status === 500) console.error('Lỗi khi lấy tiêu chí Office:', error);
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
