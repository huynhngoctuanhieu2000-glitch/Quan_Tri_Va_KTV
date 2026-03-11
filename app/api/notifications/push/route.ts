import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// 🔧 VAPID CONFIGURATION
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BEQkLUJGYdeaVqOoHGQ8JGks-EcGlWWi9R4LHSjyPMH3dLSR3-GGsFwu6YvWFv9jO7uHlK-UogSGkgfNuLr1kS7o';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'sMNjj18PAzSRo_36rNKDIQY28jihusAiovtTANk_NHw';
const GMAIL_ACCOUNT = 'huynhngoctuanhieu2000@gmail.com'; // Contact email for VAPID

// 🏗️ LAZY INITIALIZATION
let isVapidInitialized = false;
const initVapid = () => {
    if (isVapidInitialized) return;
    try {
        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
            console.warn('⚠️ [Push API] VAPID keys missing — skipping initialization');
            return;
        }
        webpush.setVapidDetails(
            `mailto:${GMAIL_ACCOUNT}`,
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY
        );
        isVapidInitialized = true;
    } catch (err) {
        console.error('❌ [Push API] VAPID initialization failed:', err);
    }
};

export async function POST(request: Request) {
    initVapid();
    try {
        // 🔒 SECURITY CHECK
        const authHeader = request.headers.get('x-webhook-secret');
        if (authHeader !== process.env.WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { title, message, url, targetStaffIds } = body;

        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Fetch subscriptions for target staff or by roles
        const { targetRoles } = body; // Array of roles like ['ADMIN', 'RECEPTIONIST']
        
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
            return NextResponse.json({ success: true, message: 'No subscriptions found' });
        }

        // 2. Send push to each subscription
        const payload = JSON.stringify({
            title: title || 'Ngân Hà Spa',
            body: message || 'Bạn có thông báo mới!',
            url: url || '/'
        });

        const pushPromises = subs.map(item => 
            webpush.sendNotification(item.subscription, payload)
                .catch(err => {
                    console.error('Push error for sub:', err.endpoint, err.statusCode);
                    // If subscription is expired/invalid, we should ideally remove it here
                    return null;
                })
        );

        await Promise.all(pushPromises);

        return NextResponse.json({ success: true, count: subs.length });
    } catch (error: any) {
        console.error('❌ [Push API] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
