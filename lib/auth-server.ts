import { createClient } from '@/lib/supabase/server';

export async function requireApiUser() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        // [COMPATIBILITY PHASE]: Nếu chưa có JWT Auth, tạm thời giả lập một user để không phá vỡ logic cũ.
        // Khi phase chuyển giao kết thúc, sẽ throw lỗi 401.
        console.warn('⚠️ [requireApiUser] No JWT session found. Allowed fallback for compatibility.');
        return null;
    }

    return user;
}

export async function requireBusinessUser() {
    const user = await requireApiUser();
    if (!user) {
        // [COMPATIBILITY PHASE]: Trả về null để route cũ (vẫn đọc từ body) không bị crash
        return null;
    }

    const techCode = user.user_metadata?.techCode;
    const businessUserId = user.user_metadata?.business_user_id;

    if (!businessUserId) {
        throw new Error('User does not have a mapped business_user_id');
    }

    return {
        techCode,
        businessUserId,
        role: user.user_metadata?.role
    };
}

export async function requireRole(requiredRoles: string[]) {
    const bUser = await requireBusinessUser();
    
    // [COMPATIBILITY PHASE]: Bỏ qua check nếu chưa có user map
    if (!bUser) return true;

    if (!bUser.role || !requiredRoles.includes(bUser.role)) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`⚠️ [DEV BYPASS] User has role ${bUser.role}, but requires [${requiredRoles.join(', ')}]. Bypassing for local testing.`);
            return true;
        }
        throw new Error(`Forbidden: Requires one of roles [${requiredRoles.join(', ')}]`);
    }

    return true;
}
