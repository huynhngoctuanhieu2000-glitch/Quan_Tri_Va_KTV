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

        // 🧹 DỌN DẸP SPAM: Nếu thiết bị này (cùng endpoint) đã từng đăng nhập tài khoản khác,
        // hãy xoá các đăng ký cũ của tài khoản đó để tránh trùng lặp khi Push.
        try {
            const { data: allSubs } = await supabase.from('StaffPushSubscriptions').select('staff_id, subscription');
            if (allSubs) {
                const targetEndpoint = subscription.endpoint;
                for (const sub of allSubs) {
                    const ep = (sub.subscription as any)?.endpoint;
                    if (ep === targetEndpoint && sub.staff_id !== staffId) {
                        await supabase
                            .from('StaffPushSubscriptions')
                            .delete()
                            .eq('staff_id', sub.staff_id)
                            .eq('subscription', sub.subscription);
                        console.log(`🧹 [Subscribe API] Xoá subscription cũ của user ${sub.staff_id} do trùng thiết bị.`);
                    }
                }
            }
        } catch (cleanupErr) {
            console.error('⚠️ [Subscribe API] Cleanup old subscriptions failed:', cleanupErr);
        }

        console.log('✅ [Subscribe API] Push subscription saved for staff:', staffId);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('❌ [Subscribe API] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
