import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkKTV(ktvId: string) {
    console.log(`🔍 Checking KTV: ${ktvId}`);

    const today = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: turn, error } = await supabase
        .from('TurnQueue')
        .select('*')
        .eq('date', today)
        .eq('employee_id', ktvId)
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`TurnQueue for ${ktvId}:`);
    console.log(`- Status: ${turn.status}`);
    console.log(`- Room: ${turn.room_id} | Bed: ${turn.bed_id}`);
    console.log(`- Current Order: ${turn.current_order_id}`);
    console.log(`- Booking Item IDs: ${turn.booking_item_ids}`);
}

checkKTV('NH018');
