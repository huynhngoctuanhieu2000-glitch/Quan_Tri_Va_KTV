import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBedV2_1() {
    console.log(`🔍 Checking Bed V2-1 deeply...`);

    const { data: bookings } = await supabase
        .from('Bookings')
        .select('*')
        .eq('roomName', 'V2')
        .eq('bedId', 'V2-1')
        .in('status', ['IN_PROGRESS', 'PREPARING', 'READY', 'FEEDBACK', 'CLEANING']);

    console.log(`Found ${bookings?.length} problematic bookings on V2-1:`);
    bookings?.forEach(b => {
        console.log(`- Bill: ${b.billCode} | Status: ${b.status} | CreatedAt: ${b.createdAt} | KTV: ${b.technicianCode}`);
    });
}

checkBedV2_1();
