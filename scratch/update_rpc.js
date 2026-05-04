const fs = require('fs');
const { Client } = require('pg');

async function run() {
    const env = fs.readFileSync('.env.local', 'utf-8');
    const directUrlMatch = env.match(/DIRECT_URL=["']?(.*?)["']?(\n|$)/);
    const directUrl = directUrlMatch ? directUrlMatch[1] : null;

    if (!directUrl) {
        console.error('Could not find DIRECT_URL');
        return;
    }

    const client = new Client({
        connectionString: directUrl
    });

    try {
        await client.connect();
        console.log('Connected to db');

        const sql = fs.readFileSync('supabase/migrations/20260504150000_update_dispatch_rpc_booking_item_ids.sql', 'utf-8');
        await client.query(sql);

        console.log('Successfully updated RPC dispatch_confirm_booking');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.end();
    }
}

run();
