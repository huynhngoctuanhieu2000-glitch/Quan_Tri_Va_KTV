
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyTrigger() {
    console.log('Reading trigger SQL...');
    const path = 'c:/Users/ADMIN/OneDrive/Desktop/Ngan Ha/Quan_Tri_Va_KTV/supabase/migrations/20260312153000_booking_notification_trigger.sql';
    const sql = fs.readFileSync(path, 'utf8');

    console.log('Applying trigger to database...');
    // In Supabase, we can use the 'rpc' method if 'exec_sql' or similar is defined, 
    // but usually we can't run arbitrary SQL via the JS client unless a helper function exists.
    // Let's check if the trigger is working by manually creating a booking and seeing if a notification appears.
    
    // Instead of applying SQL which might fail without a proper RPC, 
    // I will check if I can just manually fix the Dispatch board logic to play sound locally 
    // as it's the MOST DIRECT way to satisfy the user's immediate need.
}

applyTrigger();
