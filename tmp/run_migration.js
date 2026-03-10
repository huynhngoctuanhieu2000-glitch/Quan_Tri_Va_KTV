const { Client } = require('pg');
const fs = require('fs');

const connectionString = "postgresql://postgres.adzfohfdindovfcpaizb:KldSnHk8nggpuhpS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function runMigration() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log('Connected to database');
        
        const migrationPath = "c:\\Users\\ADMIN\\OneDrive\\Desktop\\Ngan Ha\\Quan_Tri_Va_KTV\\supabase\\migrations\\20260309110000_rating_notification_trigger.sql";
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Running migration...');
        await client.query(sql);
        console.log('Migration completed successfully');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
