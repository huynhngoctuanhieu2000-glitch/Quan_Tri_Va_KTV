const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEnum() {
  const { data, error } = await supabase.rpc('get_enum_values', { enum_name: 'BookingStatus' });
  
  if (error) {
    // If RPC doesn't exist, try raw SQL
    const { data: data2, error: error2 } = await supabase.from('Bookings').select('status').limit(10);
    console.log('Sample Booking statuses:', data2);
    
    // Try to query pg_enum directly via Postgres function if possible, or just look at information_schema
    const { data: data3, error: error3 } = await supabase.rpc('inspect_type', { type_name: 'BookingStatus' });
    console.log('Type inspection:', data3 || error3);
    
    // If all fails, manually check some usual suspects
    const statuses = ['new', 'preparing', 'confirmed', 'in_progress', 'completed', 'done', 'cancelled', 'NEW', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED'];
    console.log('Probing statuses...');
    for (const s of statuses) {
        const { error: probeError } = await supabase.from('Bookings').update({ status: s }).eq('id', 'non-existent-id');
        if (probeError && probeError.message.includes('invalid input value for enum')) {
            // invalid
        } else {
            console.log(`✅ Valid status: ${s}`);
        }
    }
  } else {
    console.log('Enum values:', data);
  }
}

checkEnum();
