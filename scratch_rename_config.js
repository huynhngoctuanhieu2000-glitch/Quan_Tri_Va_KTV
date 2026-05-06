const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Check if uppercase key exists
    const { data: oldConfig } = await supabase.from('SystemConfigs').select('*').eq('key', 'KTV_MINIMUM_DEPOSIT').single();
    
    if (oldConfig) {
        console.log('Found old config:', oldConfig);
        const { error } = await supabase.from('SystemConfigs').update({ key: 'ktv_min_deposit' }).eq('id', oldConfig.id);
        if (error) {
            console.error('Failed to update:', error);
        } else {
            console.log('Successfully renamed key to ktv_min_deposit');
        }
    } else {
        console.log('Old config KTV_MINIMUM_DEPOSIT not found. Maybe it was already renamed.');
    }
})();
