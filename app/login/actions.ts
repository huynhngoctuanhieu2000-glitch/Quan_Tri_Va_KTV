'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function authenticateUser(username: string, password?: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error("Supabase admin client not initialized");

        const query = supabase
            .from('Users')
            .select('*')
            .eq('username', username);

        if (password) {
            query.eq('password', password);
        }

        const { data: user, error } = await query.single();

        if (error || !user) {
            console.error("Login failed or user not found", error);
            return { success: false, error: 'Sai tài khoản hoặc mật khẩu' };
        }

        return { success: true, user };
    } catch (error: any) {
        console.error('Login action error:', error);
        return { success: false, error: error.message };
    }
}
