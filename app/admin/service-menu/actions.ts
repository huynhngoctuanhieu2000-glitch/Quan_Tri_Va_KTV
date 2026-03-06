'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function getServices() {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        const { data, error } = await supabase
            .from('Services')
            .select('*')
            .order('category', { ascending: true })
            .order('nameVN', { ascending: true });

        if (error) throw error;

        return { success: true, data };
    } catch (error: any) {
        console.error('❌ [Server] getServices error:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
}
