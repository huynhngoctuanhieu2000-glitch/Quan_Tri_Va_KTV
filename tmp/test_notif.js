
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2Nzk4MDAsImV4cCI6MjA4NzI1NTgwMH0.C7-HhcJDfbh41JTcoc-mjguSiGiTvN3SjDl-OecDKIk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testNotif() {
    console.log('Inserting test notification into StaffNotifications...');
    const { data, error } = await supabase
        .from('StaffNotifications')
        .insert({
            type: 'NEW_ORDER',
            message: 'TEST NOTIFICATION - ' + new Date().toLocaleTimeString(),
            isRead: false
        })
        .select();

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Success! Inserted ID:', data[0].id);
    }
}

testNotif();
