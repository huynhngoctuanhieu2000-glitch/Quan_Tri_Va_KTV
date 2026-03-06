'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function getAllUsers() {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error("Supabase admin client not initialized");

        const { data: users, error } = await supabase
            .from('Users')
            .select('id, username, password, fullName, role, permissions, isOnShift, isBusy, createdAt, googleId')
            .order('createdAt', { ascending: false });

        if (error) throw error;

        return { success: true, data: users };
    } catch (error: any) {
        console.error('Error fetching users:', error);
        return { success: false, error: error.message };
    }
}
