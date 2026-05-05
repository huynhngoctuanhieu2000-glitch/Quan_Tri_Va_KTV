import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
    try {
        // 1. Get all active KTVs
        const { data: ktvs, error: ktvError } = await supabase
            .from('Staff')
            .select('id, full_name, position')
            .eq('status', 'ĐANG LÀM')
            .ilike('id', 'NH%') // Basic filter for KTVs, or you can filter by position
            .order('id');

        if (ktvError) {
            return NextResponse.json({ success: false, error: 'Cannot fetch staff list' }, { status: 500 });
        }

        // 2. Fetch wallet balance for each KTV
        // Use Promise.all for parallel RPC calls (safe for moderate number of KTVs)
        const summaryPromises = ktvs.map(async (ktv) => {
            const { data, error } = await supabase.rpc('get_ktv_wallet_balance', {
                p_staff_id: ktv.id
            });
            
            if (error) {
                console.error(`Error fetching balance for ${ktv.id}:`, error);
                return null;
            }

            return {
                id: ktv.id,
                name: ktv.full_name,
                position: ktv.position,
                ...data
            };
        });

        const summaries = await Promise.all(summaryPromises);
        const validSummaries = summaries.filter(Boolean);

        return NextResponse.json({ success: true, data: validSummaries });
    } catch (err: any) {
        console.error('Exception in /api/finance/ktv-summary:', err);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
