const { Client } = require('pg');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const connStr = env.match(/DIRECT_URL="([^"]+)"/)[1];

async function check() {
    const client = new Client({ connectionString: connStr });
    await client.connect();

    const res = await client.query(`
        SELECT pg_get_functiondef(oid) as def
        FROM pg_proc
        WHERE proname = 'fn_notify_ktv_on_item_rating';
    `);

    if (res.rows.length > 0) {
        console.log(res.rows[0].def);
    } else {
        console.log('Function not found.');
    }

    await client.end();
}

check();
