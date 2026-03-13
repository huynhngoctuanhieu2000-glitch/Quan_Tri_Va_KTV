const { createClient } = require('@supabase/supabase-client');
// Assuming .env.local is in the root
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNotifs() {
  console.log('--- DIAGNOSING STAFF NOTIFICATIONS ---');
  
  // 1. Check table count
  const { count, error: countError } = await supabase
    .from('StaffNotifications')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.error('Error counting StaffNotifications:', countError.message);
  } else {
    console.log('Total notifications in table:', count);
  }

  // 2. Sample data
  const { data, error: dataError } = await supabase
    .from('StaffNotifications')
    .select('*')
    .limit(5);
  
  if (dataError) {
    console.error('Error fetching sample data:', dataError.message);
  } else {
    console.log('Sample data:', JSON.stringify(data, null, 2));
  }

  // 3. Check for today's data (UTC)
  const today = new Date().toISOString().split('T')[0];
  const start = `${today}T00:00:00Z`;
  const end = `${today}T23:59:59Z`;
  
  const { count: todayCount, error: todayError } = await supabase
    .from('StaffNotifications')
    .select('*', { count: 'exact', head: true })
    .gte('createdAt', start)
    .lte('createdAt', end);
  
  if (todayError) {
    console.error('Error counting today notifications:', todayError.message);
  } else {
    console.log('Notifications for today (UTC):', todayCount);
  }
}

checkNotifs();
