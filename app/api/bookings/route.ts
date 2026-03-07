import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
        
        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        const startOfDay = `${date} 00:00:00`;
        const endOfDay = `${date} 23:59:59`;

        const { data: bookings, error: bError } = await supabase
            .from('Bookings')
            .select('*')
            .gte('bookingDate', startOfDay)
            .lte('bookingDate', endOfDay)
            .order('createdAt', { ascending: true });

        if (bError) throw bError;

        if (bookings && bookings.length > 0) {
            const bookingIds = bookings.map(b => b.id);
            const { data: items, error: iError } = await supabase
                .from('BookingItems')
                .select('*')
                .in('bookingId', bookingIds);

            if (!iError && items) {
                // Attach BookingItems to each booking
                const bookingsWithItems = bookings.map(b => ({
                    ...b,
                    BookingItems: items.filter(i => i.bookingId === b.id)
                }));
                return NextResponse.json({ success: true, data: bookingsWithItems });
            }
        }

        return NextResponse.json({ success: true, data: bookings || [] });
    } catch (error: any) {
        console.error('API Error (Bookings):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
