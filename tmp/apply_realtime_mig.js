const { Client } = require('pg');
const fs = require('fs');

const connectionString = "postgresql://postgres.adzfohfdindovfcpaizb:KldSnHk8nggpuhpS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function runMigration() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log('Connected to database');
        
        const migrationPath = "supabase/migrations/20260315150000_enable_realtime_sync.sql";
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Running migration...');
        await client.query(sql);
        console.log('Migration completed successfully');
    } catch (err) {
        // If already added, ignore
        if (err.message.includes('already exists')) {
            console.log('Tables already in publication.');
        } else {
            console.error('Migration failed:', err);
        }
    } finally {
        await client.end();
    }
}

runMigration();
