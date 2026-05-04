import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDetailed(bookingId: string) {
    const { data: items } = await supabase.from('BookingItems').select('*').eq('bookingId', bookingId);
    items?.forEach(item => {
        console.log(`Item ID: ${item.id}`);
        const segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : item.segments;
        console.log(`Segments Type: ${typeof item.segments}`);
        console.log(`Segments: ${JSON.stringify(segs)}`);
        segs.forEach((s: any) => {
            console.log(`  Segment ${s.id}: actualEndTime = ${s.actualEndTime}`);
        });
    });
}

const bookingId = '934cd136-b04b-40a4-bbd9-4d20be033702';
checkDetailed(bookingId);
