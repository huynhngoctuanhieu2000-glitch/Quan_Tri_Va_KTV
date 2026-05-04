import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTurnQueue(roomId: string, bedId: string) {
    console.log(`🔍 Checking TurnQueue for Room: ${roomId}, Bed: ${bedId}`);

    const today = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: turns, error } = await supabase
        .from('TurnQueue')
        .select('*')
        .eq('date', today)
        .eq('room_id', roomId)
        .eq('bed_id', bedId);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${turns.length} TurnQueue records for today in ${roomId} ${bedId}`);
    turns.forEach(t => {
        console.log(`- KTV: ${t.employee_id} | Status: ${t.status} | Booking: ${t.current_order_id}`);
    });
}

// "V2 G1"
checkTurnQueue('V2', 'V2-1');
