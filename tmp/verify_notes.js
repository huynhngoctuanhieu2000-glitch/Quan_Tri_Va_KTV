const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyNotes() {
    const bookingId = '01-01022026'; // A sample ID from previous list
    const testNotes = '[Đánh giá KTV: Dễ thương, Hướng nội]';
    
    console.log(`Testing APPEND_NOTES for booking ${bookingId}...`);
    
    // Simulate what the API does
    const { data: currentB } = await supabase.from('Bookings').select('notes, status').eq('id', bookingId).single();
    const oldNotes = currentB?.notes || '';
    let newNotes = '';
    if (!oldNotes.includes(testNotes)) {
        newNotes = oldNotes ? `${oldNotes} | ${testNotes}` : testNotes;
    } else {
        newNotes = oldNotes;
    }
    
    const { data: updatedB, error } = await supabase.from('Bookings')
        .update({ notes: newNotes, updatedAt: new Date().toISOString() })
        .eq('id', bookingId)
        .select()
        .single();
        
    if (error) {
        console.error('Update failed:', error);
    } else {
        console.log('Update success!');
        console.log('New notes:', updatedB.notes);
    }
}

verifyNotes();
