import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/notifications/subscribe
 * Save push subscription to database using admin client (bypasses RLS)
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { staffId, subscription, userAgent } = body;

        if (!staffId || !subscription) {
            return NextResponse.json(
                { success: false, error: 'staffId and subscription are required' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json(
                { success: false, error: 'Supabase admin not initialized' },
                { status: 500 }
            );
        }

        // Upsert subscription (replace if same staff + same endpoint)
        const { error } = await supabase
            .from('StaffPushSubscriptions')
            .upsert({
                staff_id: staffId,
                subscription: subscription,
                user_agent: userAgent || 'unknown',
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'staff_id,subscription'
            });

        if (error) {
            console.error('❌ [Subscribe API] Error saving subscription:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        console.log('✅ [Subscribe API] Push subscription saved for staff:', staffId);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('❌ [Subscribe API] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
