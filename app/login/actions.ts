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

export async function updateProfileInDB(userId: string, name: string, avatarUrl: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error("Supabase admin client not initialized");

        const { error } = await supabase
            .from('Users')
            .update({ fullName: name }) // Assuming Users table uses fullName
            .eq('id', userId);

        if (error) throw error;

        // Also check if we need to update Staff table
        const { error: staffError } = await supabase
            .from('Staff')
            .update({ full_name: name, avatar_url: avatarUrl })
            .eq('id', userId);

        if (staffError) {
            console.warn("Could not update Staff profile, might not be a staff member", staffError.message);
        }

        return { success: true };
    } catch (error: any) {
        console.error('Update profile error:', error);
        return { success: false, error: error.message };
    }
}

export async function updatePasswordInDB(userId: string, newPassword: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error("Supabase admin client not initialized");

        const { error } = await supabase
            .from('Users')
            .update({ password: newPassword })
            .eq('id', userId);

        if (error) throw error;

        return { success: true };
    } catch (error: any) {
        console.error('Update password error:', error);
        return { success: false, error: error.message };
    }
}
