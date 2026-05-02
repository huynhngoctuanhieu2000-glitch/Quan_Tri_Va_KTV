import { createClient } from '@/lib/supabase/server';

export async function requireApiUser() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return null;
    }

    return user;
}

export async function requireBusinessUser() {
    const user = await requireApiUser();
    if (!user) {
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
    
    if (!bUser) {
        throw new Error('Unauthorized');
    }

    if (!bUser.role || !requiredRoles.includes(bUser.role)) {
        throw new Error('Forbidden');
    }

    return true;
}
