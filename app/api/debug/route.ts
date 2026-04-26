import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'No supabase' });

    const { data: users } = await supabase.from('Users').select('id, username, code').limit(5);
    const { data: staff } = await supabase.from('Staff').select('id, full_name').limit(5);

    return NextResponse.json({ users, staff });
}
