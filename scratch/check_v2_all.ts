import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkV2_1() {
    const { data: bookings, error } = await supabase
        .from('Bookings')
        .select('*')
        .eq('roomName', 'V2')
        .in('status', ['IN_PROGRESS', 'PREPARING', 'FEEDBACK', 'CLEANING']);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${bookings.length} active bookings in Room V2:`);
    bookings.forEach(b => {
        console.log(`- Bill: ${b.billCode} | Bed: ${b.bedId} | Status: ${b.status} | KTV: ${b.technicianCode}`);
    });
}

checkV2_1();
