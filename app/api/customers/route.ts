import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // 1. Fetch all customers
        const { data: customers, error: cError } = await supabase
            .from('Customers')
            .select('*')
            .order('fullName', { ascending: true });

        if (cError) throw cError;
        if (!customers || customers.length === 0) {
            return NextResponse.json({ success: true, data: [] });
        }

        // 2. Fetch all completed bookings (to calculate stats)
        // Link via customerId instead of phone
        const { data: allBookings, error: bError } = await supabase
            .from('Bookings')
            .select('id, customerId, customerEmail, status, bookingDate, totalAmount, createdAt')
            .in('status', ['COMPLETED', 'DONE', 'FEEDBACK']);

        if (bError) {
            console.error('Error fetching bookings for stats:', bError);
            return NextResponse.json({ success: true, data: customers });
        }

        // 3. Create Maps for grouping bookings by customerId AND email
        const bookingsByCustomerId = new Map<string, any[]>();
        const bookingsByEmail = new Map<string, any[]>();

        (allBookings || []).forEach(b => {
            if (b.customerId) {
                if (!bookingsByCustomerId.has(b.customerId)) {
                    bookingsByCustomerId.set(b.customerId, []);
                }
                bookingsByCustomerId.get(b.customerId)?.push(b);
            }
            if (b.customerEmail) {
                const emailKey = b.customerEmail.toLowerCase().trim();
                if (!bookingsByEmail.has(emailKey)) {
                    bookingsByEmail.set(emailKey, []);
                }
                bookingsByEmail.get(emailKey)?.push(b);
            }
        });

        // 4. Aggregate data per customer
        const enrichedCustomers = customers.map(customer => {
            // Get bookings by ID or Email
            const byId = customer.id ? bookingsByCustomerId.get(customer.id) || [] : [];
            const byEmail = customer.email ? bookingsByEmail.get(customer.email.toLowerCase().trim()) || [] : [];
            
            // Combine and deduplicate bookings by ID
            const combinedBookings = [...byId];
            const existingIds = new Set(combinedBookings.map(b => b.id));
            
            byEmail.forEach(b => {
                if (!existingIds.has(b.id)) {
                    combinedBookings.push(b);
                }
            });
            
            const visitCount = combinedBookings.length;
            const totalSpent = combinedBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
            
            // Find most recent visit
            const lastBooking = combinedBookings.sort((a, b) => {
                const dateA = new Date(a.bookingDate || a.createdAt).getTime();
                const dateB = new Date(b.bookingDate || b.createdAt).getTime();
                return dateB - dateA;
            })[0];

            return {
                ...customer,
                visitCount,
                totalSpent,
                lastVisited: lastBooking ? (lastBooking.bookingDate || lastBooking.createdAt) : customer.lastVisited
            };
        });

        return NextResponse.json({ success: true, data: enrichedCustomers });
    } catch (error: any) {
        console.error('API Error (Customers):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
