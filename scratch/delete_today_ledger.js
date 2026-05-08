const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const s = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function deleteTodayLedger() {
    // Xóa tất cả ledger từ ngày 8/5 trở đi
    const { data, error } = await s
        .from('KTVDailyLedger')
        .delete()
        .gte('date', '2026-05-08');

    if (error) {
        console.error("Lỗi khi xóa:", error);
    } else {
        console.log("✅ Đã xóa thành công các bản ghi Sổ cái của ngày 08/05/2026 trở đi.");
    }
}

deleteTodayLedger();
