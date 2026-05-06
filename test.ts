import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data: att } = await supabase.from('KTVAttendance').select('*').eq('employeeName', 'NH011').order('createdAt', { ascending: false }).limit(5);
  console.log('Attendance records for NH011:', att);

  const { data: tq } = await supabase.from('TurnQueue').select('*').eq('employee_id', 'NH011').order('date', { ascending: false }).limit(3);
  console.log('TurnQueue for NH011:', tq);
}
check();
