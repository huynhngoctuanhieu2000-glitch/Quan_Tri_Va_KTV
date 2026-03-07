'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';

export async function getStaffList() {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error("Supabase admin client not initialized");
        const { data: staff, error } = await supabase
            .from('Staff')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch user login data to display username and password
        const { data: users, error: usersError } = await supabase
            .from('Users')
            .select('id, username, password');

        if (usersError) {
            console.warn("Could not fetch Users data", usersError);
        }

        const staffWithAuth = staff.map(s => {
            const authInfo = users?.find(u => u.id === s.id);
            return {
                ...s,
                username: authInfo?.username || s.id,
                password: authInfo?.password || '---'
            };
        });

        return { success: true, data: staffWithAuth };
    } catch (error: any) {
        console.error('Error fetching staff list:', error);
        return { success: false, error: error.message };
    }
}

export async function createStaffMember(formData: any) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error("Supabase admin client not initialized");
        // 1. Create entry in custom public."Users" table
        const password = formData.password;
        if (!password) {
            throw new Error("Vui lòng nhập mật khẩu đăng nhập cho nhân viên.");
        }

        const userPayload = {
            id: formData.id,
            username: formData.id, // Ensure username is the Employee ID (NV-001)
            password: password,
            code: formData.id,
            fullName: formData.full_name,
            gender: formData.gender || null,
            role: 'TECHNICIAN',
            // Default KTV permissions mapping based on system defaults
            permissions: [
                'ktv_dashboard',
                'ktv_attendance',
                'ktv_leave',
                'ktv_performance',
                'ktv_history',
                'service_handbook',
                'settings'
            ]
        };

        const { error: userError } = await supabase
            .from('Users')
            .insert(userPayload);

        if (userError) {
            console.error('Error creating user record:', userError);
            throw new Error(`Lỗi tạo tài khoản đăng nhập: ${userError.message}`);
        }

        // 2. Insert into Staff Table
        const staffPayload = {
            id: formData.id, // ID gõ tay (e.g. NV-001)
            full_name: formData.full_name,
            status: formData.status || 'ĐANG LÀM',
            birthday: formData.birthday || null,
            gender: formData.gender || null,
            id_card: formData.id_card || null,
            phone: formData.phone || null,
            email: formData.email || null,
            bank_account: formData.bank_account || null,
            bank_name: formData.bank_name || null,
            avatar_url: formData.avatar_url || null,
            position: formData.position || 'Kỹ Thuật Viên',
            experience: formData.experience || null,
            join_date: formData.join_date || new Date().toISOString().split('T')[0],
            height: formData.height ? parseInt(formData.height) : null,
            weight: formData.weight ? parseInt(formData.weight) : null,
            skills: formData.skills || {}
        };

        const { data: staffData, error: staffError } = await supabase
            .from('Staff')
            .insert(staffPayload)
            .select()
            .single();

        if (staffError) {
            // Rollback auth user creation could be handled here if strictly necessary
            console.error('Error creating staff record:', staffError);
            throw new Error(`Lỗi lưu thông tin: ${staffError.message}`);
        }

        revalidatePath('/admin/employees');
        return { success: true, data: staffData };

    } catch (error: any) {
        console.error('Error in createStaffMember action:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteStaffMember(id: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error("Supabase admin client not initialized");

        // 1. Delete from Staff Table
        const { error: staffError } = await supabase
            .from('Staff')
            .delete()
            .eq('id', id);

        if (staffError) {
            console.error('Error deleting staff record:', staffError);
            throw new Error(`Lỗi xoá thông tin: ${staffError.message}`);
        }

        // 2. Delete from Users Table
        const { error: userError } = await supabase
            .from('Users')
            .delete()
            .eq('id', id);

        if (userError) {
            console.error('Error deleting user record:', userError);
            // Non-fatal error
        }

        revalidatePath('/admin/employees');
        return { success: true };
    } catch (error: any) {
        console.error('Error in deleteStaffMember action:', error);
        return { success: false, error: error.message };
    }
}
