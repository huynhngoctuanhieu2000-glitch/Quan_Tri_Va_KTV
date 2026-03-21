import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data: bOptions } = await supabase.from('Bookings').select('*').limit(1);
  console.log("Bookings columns:", bOptions && bOptions[0] ? Object.keys(bOptions[0]) : "No data");

  const { data: biOptions } = await supabase.from('BookingItems').select('*').limit(1);
  console.log("BookingItems columns:", biOptions && biOptions[0] ? Object.keys(biOptions[0]) : "No data");

  const { data: cOptions } = await supabase.from('Customers').select('*').limit(1);
  console.log("Customers columns:", cOptions && cOptions[0] ? Object.keys(cOptions[0]) : "No data");
}

checkSchema().catch(console.error);
