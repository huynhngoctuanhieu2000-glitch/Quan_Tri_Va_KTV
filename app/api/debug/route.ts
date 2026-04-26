import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'No supabase' });

    const msg = `Test message`;
    const { data, error } = await supabase.from('StaffNotifications').insert({
        bookingId: null, // wait, bookingId is text FK -> Bookings. Is it nullable?
        employeeId: null, // Global cho quầy
        type: 'NEW_ORDER',
        message: msg,
        isRead: false
    });

    return NextResponse.json({ data, error });
}
