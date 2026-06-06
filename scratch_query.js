const fs = require('fs');
const fileContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
fileContent.split(/\r?\n/).forEach(line => {
  const eqIdx = line.indexOf('=');
  if (eqIdx !== -1) {
    const key = line.substring(0, eqIdx).trim();
    let val = line.substring(eqIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkKTVDailyLedgerSchema() {
  const { data: ledger, error } = await supabase
    .from('KTVDailyLedger')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error fetching ledger:', error);
  } else {
    console.log('KTVDailyLedger columns:', Object.keys(ledger[0] || {}));
  }
}

checkKTVDailyLedgerSchema().catch(console.error);
