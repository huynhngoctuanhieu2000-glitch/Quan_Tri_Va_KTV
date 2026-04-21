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

export async function verifyAdminPassword(inputPassword: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error("Supabase admin client not initialized");

        const { data, error } = await supabase
            .from('SystemConfigs')
            .select('value')
            .eq('key', 'admin_unlock_password')
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            return { success: false, error: 'Chưa cấu hình mật khẩu hệ thống. Vui lòng thêm key "admin_unlock_password" vào bảng SystemConfigs.' };
        }

        // value is stored as jsonb, could be a string or { password: "..." }
        const storedPassword = typeof data.value === 'string' ? data.value : data.value?.password;

        if (inputPassword === storedPassword) {
            return { success: true };
        } else {
            return { success: false, error: 'Mật khẩu không chính xác!' };
        }
    } catch (error: any) {
        console.error('Error verifying admin password:', error);
        return { success: false, error: error.message };
    }
}
