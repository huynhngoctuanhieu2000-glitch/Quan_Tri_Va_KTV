const { Client } = require('pg');

const connectionString = "postgresql://postgres.adzfohfdindovfcpaizb:KldSnHk8nggpuhpS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function inspectSchema() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        
        console.log('--- Columns in Bookings ---');
        const columns = await client.query(`
            SELECT column_name, data_type, character_maximum_length, is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'Bookings'
            ORDER BY ordinal_position;
        `);
        console.table(columns.rows);

        console.log('\n--- Constraints in Bookings ---');
        const constraints = await client.query(`
            SELECT conname, pg_get_constraintdef(oid) 
            FROM pg_constraint 
            WHERE conrelid = 'public."Bookings"'::regclass;
        `);
        console.table(constraints.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

inspectSchema();
