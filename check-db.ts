import { getSupabaseAdmin } from './lib/supabaseAdmin';

async function checkUsers() {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
        console.log("No admin key found");
        return;
    }
    const { data, error } = await supabase.from('Users').select('*').limit(5);
    if (error) {
        console.error("DB Error:", error);
    } else {
        console.log("Users Found:", data);
    }
}

checkUsers();
