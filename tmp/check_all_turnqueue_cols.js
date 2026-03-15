const { Client } = require('pg');

const connectionString = "postgresql://postgres.adzfohfdindovfcpaizb:KldSnHk8nggpuhpS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function checkAllCols() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'TurnQueue';
        `);
        console.log(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkAllCols();
