const { Client } = require('pg');

const connectionString = "postgresql://postgres.adzfohfdindovfcpaizb:KldSnHk8nggpuhpS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function checkBooking() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log('Connected');

        // Try update with multiple technician codes
        console.log('Attempting update with multiple techs: "NH001, NH002"...');
        const res = await client.query(`
            UPDATE "Bookings" 
            SET status = 'PREPARING', 
                "technicianCode" = 'NH001, NH002', 
                "updatedAt" = NOW() 
            WHERE id = '11NDK-005-09032026' 
            RETURNING *;
        `);
        
        if (res.rowCount > 0) {
            console.log('✅ Update SUCCESS');
            console.log('Status:', res.rows[0].status);
            console.log('technicianCode:', res.rows[0].technicianCode);
        } else {
            console.log('❌ Booking not found');
        }

    } catch (err) {
        console.error('❌ Update FAILED:', err.message);
    } finally {
        await client.end();
    }
}

checkBooking();
