import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve('c:\\Users\\ADMIN\\OneDrive\\Desktop\\Ngan Ha\\Quan_Tri_Va_KTV\\.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const { data: turns } = await supabase.from('TurnQueue').select('*');
  console.log('TurnQueue:', turns);

  const { data: att } = await supabase.from('KTVAttendance').select('*').order('checkedAt', { ascending: false }).limit(5);
  console.log('Recent KTVAttendance:', att);
}

checkData();
