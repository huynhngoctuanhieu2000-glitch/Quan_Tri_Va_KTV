import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

sb.from('KTVLeaveRequests').select('*').eq('employeeId', 'NH016').then(r => console.log(JSON.stringify(r.data, null, 2)));
