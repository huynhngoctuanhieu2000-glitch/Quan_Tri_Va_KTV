
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2Nzk4MDAsImV4cCI6MjA4NzI1NTgwMH0.C7-HhcJDfbh41JTcoc-mjguSiGiTvN3SjDl-OecDKIk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTriggers() {
    console.log('Inspecting triggers on Bookings table...');
    // We can't query pg_trigger directly via ANON key usually, but we can try a rpc or see if we can get info
    // Alternatively, just try to query StaffNotifications to see if the trigger worked for recent bookings
    
    const { data: recentBookings, error: bError } = await supabase
        .from('Bookings')
        .select('id, billCode, customerName, createdAt')
        .order('createdAt', { ascending: false })
        .limit(5);

    if (bError) {
        console.error('Error fetching bookings:', bError.message);
        return;
    }

    console.log('Recent bookings:', recentBookings.map(b => `${b.billCode} (${b.id})`).join(', '));

    const bookingIds = recentBookings.map(b => b.id);
    
    const { data: notifications, error: nError } = await supabase
        .from('StaffNotifications')
        .select('*')
        .in('bookingId', bookingIds);

    if (nError) {
        console.error('Error fetching notifications:', nError.message);
        return;
    }

    console.log('Notifications corresponding to these bookings:');
    recentBookings.forEach(b => {
        const notif = notifications.find(n => n.bookingId === b.id);
        console.log(`Booking ${b.billCode}: ${notif ? '✅ Notified' : '❌ NO NOTIFICATION'}`);
    });
}

inspectTriggers();
