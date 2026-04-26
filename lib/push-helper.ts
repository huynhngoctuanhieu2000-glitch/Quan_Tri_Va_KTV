import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// 🔧 VAPID CONFIGURATION
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BNEVJHwVmuU6e7vYPOm1S2hpAWprAhUNl6ew85ktt_HBH2osu4wkrbMXnC8uFj5IZtYXBawvSa1C33bVHTeo6lE';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '8YrwgZmKBy0dv5yOetQklOS36z_pYCRzf52jD8rmvOg';
const GMAIL_ACCOUNT = 'huynhngoctuanhieu2000@gmail.com'; // Contact email for VAPID

// 🏗️ LAZY INITIALIZATION
let isVapidInitialized = false;
const initVapid = () => {
    if (isVapidInitialized) return;
    try {
        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
            console.warn('⚠️ [Push Helper] VAPID keys missing — skipping initialization');
            return;
        }
        webpush.setVapidDetails(
            `mailto:${GMAIL_ACCOUNT}`,
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY
        );
        isVapidInitialized = true;
    } catch (err) {
        console.error('❌ [Push Helper] VAPID initialization failed:', err);
    }
};

export interface PushPayload {
    title: string;
    message: string;
    url?: string;
    targetStaffIds?: string[];
    targetRoles?: string[];
}

export async function sendPushNotification(payload: PushPayload) {
    initVapid();
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        const { title, message, url, targetStaffIds, targetRoles } = payload;
        
        let query = supabase.from('StaffPushSubscriptions').select(`
            subscription,
            Users:staff_id (
                role
            )
        `);
        
        if (targetStaffIds && targetStaffIds.length > 0) {
            query = query.in('staff_id', targetStaffIds);
        } else if (targetRoles && targetRoles.length > 0) {
            // Target specific roles
            const rolesFilter = targetRoles.map((r: string) => `role.eq.${r.toUpperCase()}`).join(',');
            query = query.or(rolesFilter, { foreignTable: 'Users' });
        } else {
            // Default: Send to all ADMIN and RECEPTIONIST roles
            query = query.or('role.eq.ADMIN,role.eq.RECEPTIONIST', { foreignTable: 'Users' });
        }

        const { data: subs, error } = await query;
        if (error) throw error;

        if (!subs || subs.length === 0) {
            console.log('📡 [Push Helper] No subscriptions found for target');
            return { success: true, count: 0 };
        }

        const pushPayload = JSON.stringify({
            title: title || 'Ngân Hà Spa',
            body: message || 'Bạn có thông báo mới!',
            url: url || '/'
        });

        const pushPromises = subs.map(item => 
            webpush.sendNotification(item.subscription as any, pushPayload)
                .catch(err => {
                    console.error('Push error for sub:', err.endpoint || 'unknown', err.statusCode);
                    // Could remove expired subscriptions here
                    return null;
                })
        );

        await Promise.all(pushPromises);
        console.log(`📡 [Push Helper] Sent ${subs.length} push notifications successfully.`);

        return { success: true, count: subs.length };
    } catch (error: any) {
        console.error('❌ [Push Helper] Error:', error);
        return { success: false, error: error.message };
    }
}
