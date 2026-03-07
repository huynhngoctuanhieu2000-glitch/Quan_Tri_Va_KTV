import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        const { data, error } = await supabase
            .from('Services')
            .select('*')
            .order('category', { ascending: true })
            .order('nameVN', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('API Error (Services):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
