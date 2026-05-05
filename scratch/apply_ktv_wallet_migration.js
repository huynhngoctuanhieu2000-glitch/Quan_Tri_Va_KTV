const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL is not defined in .env.local');
        process.exit(1);
    }

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        const sql = fs.readFileSync('supabase/migrations/20260505140600_create_ktv_wallet_tables.sql', 'utf8');
        console.log('Running migration...');
        
        await client.query(sql);
        console.log('Migration successful!');
    } catch (err) {
        console.error('Error running migration:', err);
    } finally {
        await client.end();
        console.log('Disconnected from database.');
    }
}

runMigration();
