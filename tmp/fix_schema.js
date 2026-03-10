const { Client } = require('pg');

const connectionString = "postgresql://postgres.adzfohfdindovfcpaizb:KldSnHk8nggpuhpS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function fixSchema() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log('Connected');

        // 1. Remove FK constraint
        console.log('Removing FK constraint fk_bookings_technician_staff...');
        await client.query(`ALTER TABLE "Bookings" DROP CONSTRAINT IF EXISTS fk_bookings_technician_staff;`);
        
        // 2. Ensure technicianCode is text (it already is, but just in case character-limited)
        console.log('Ensuring technicianCode is unlimited text...');
        await client.query(`ALTER TABLE "Bookings" ALTER COLUMN "technicianCode" TYPE TEXT;`);

        console.log('Schema fixed successfully');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

fixSchema();
