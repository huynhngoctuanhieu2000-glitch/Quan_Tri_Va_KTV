import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type BusinessUserRecord = {
    id: string;
    username?: string | null;
    role?: string | null;
};

async function resolveBusinessUserFromDb(user: any): Promise<BusinessUserRecord | null> {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
        throw new Error('Supabase admin not initialized');
    }

    const emailPrefix = typeof user.email === 'string' ? user.email.split('@')[0] : null;
    const candidateValues = Array.from(new Set(
        [
            user.user_metadata?.business_user_id,
            user.user_metadata?.techCode,
            emailPrefix
        ]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .flatMap(value => {
                const trimmed = value.trim();
                return [trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()];
            })
    ));

    if (candidateValues.length === 0) {
        return null;
    }

    const findInField = async (field: 'id' | 'username') => {
        const { data, error } = await supabase
            .from('Users')
            .select('id, username, role')
            .in(field, candidateValues)
            .limit(1);

        if (error) {
            throw error;
        }

        return data && data.length > 0 ? (data[0] as BusinessUserRecord) : null;
    };

    return (await findInField('id')) || (await findInField('username'));
}

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

    const dbUser = await resolveBusinessUserFromDb(user);
    const businessUserId = dbUser?.id || user.user_metadata?.business_user_id;
    const finalTechCode = dbUser?.id || user.user_metadata?.techCode || businessUserId;
    const finalRole = dbUser?.role || user.user_metadata?.role;

    if (!businessUserId) {
        throw new Error('User does not have a mapped business user');
    }

    return {
        techCode: finalTechCode,
        businessUserId,
        role: finalRole
    };
}

export async function requireRole(requiredRoles: string[]) {
    const bUser = await requireBusinessUser();
    
    if (!bUser) {
        throw new Error('Unauthorized');
    }

    const normalizedRole = typeof bUser.role === 'string' ? bUser.role.toUpperCase() : '';
    const normalizedRequiredRoles = requiredRoles.map(role => role.toUpperCase());

    if (!normalizedRole || !normalizedRequiredRoles.includes(normalizedRole)) {
        throw new Error('Forbidden');
    }

    return true;
}
