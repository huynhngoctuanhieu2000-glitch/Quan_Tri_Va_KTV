'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function getDispatchData(date: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Fetch Staff
        const { data: staffs, error: sError } = await supabase.from('Staff').select('*');
        if (sError) throw sError;

        // 2. Fetch TurnQueue
        const { data: turns, error: tError } = await supabase
            .from('TurnQueue')
            .select('*')
            .eq('date', date)
            .order('queue_position', { ascending: true });
        if (tError) throw tError;

        // 3. Fetch Bookings for selected date
        // bookingDate is "timestamp without time zone"
        const startOfDay = `${date} 00:00:00`;
        const endOfDay = `${date} 23:59:59`;

        const { data: bData, error: bError } = await supabase
            .from('Bookings')
            .select('*')
            .gte('bookingDate', startOfDay)
            .lte('bookingDate', endOfDay)
            .order('createdAt', { ascending: true });

        if (bError) throw bError;

        let bookings: any[] = bData || [];

        // 4. Fetch BookingItems separately (join fails due to multiple FK relationships)
        if (bookings.length > 0) {
            const bookingIds = bookings.map(b => b.id);
            const { data: items, error: iError } = await supabase
                .from('BookingItems')
                .select('*')
                .in('bookingId', bookingIds);

            if (iError) {
                console.error('❌ [Server] Error fetching BookingItems:', iError.message);
            }

            // 5. Fetch Services to get service names and durations
            let servicesMap: Record<string, { name: string; duration: number }> = {};
            if (items && items.length > 0) {
                const serviceIds = [...new Set(items.map(i => i.serviceId).filter(Boolean))];
                if (serviceIds.length > 0) {
                    const { data: services } = await supabase
                        .from('Services')
                        .select('*')
                        .in('id', serviceIds);
                    
                    if (services) {
                        services.forEach((s: any) => {
                            servicesMap[s.id] = { 
                                name: s.nameVN || s.nameEN || s.name || `Dịch vụ ${s.code || s.id}`, 
                                duration: s.duration || 60 
                            };
                        });
                    }
                }
            }

            // Attach BookingItems (with service info) to each booking
            bookings = bookings.map(b => ({
                ...b,
                BookingItems: (items || [])
                    .filter(i => i.bookingId === b.id)
                    .map(i => ({
                        ...i,
                        service_name: servicesMap[i.serviceId]?.name || `Dịch vụ ${i.serviceId}`,
                        duration: servicesMap[i.serviceId]?.duration || 60,
                    }))
            }));
        }

        console.log(`📡 [Server] Fetched: ${bookings.length} bookings for ${date}`);
        bookings.forEach(b => {
            console.log(`  📋 ${b.billCode}: ${(b.BookingItems || []).length} services`);
        });

        // 6. Fetch Rooms and Beds for the UI
        const { data: rooms } = await supabase.from('Rooms').select('*');
        const { data: beds } = await supabase.from('Beds').select('*');

        return {
            success: true,
            data: {
                staffs,
                turns,
                bookings,
                rooms: rooms || [],
                beds: beds || []
            }
        };
    } catch (error: any) {
        console.error('❌ [Server] getDispatchData error:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
}

export async function processDispatch(bookingId: string, dispatchData: {
    status: string;
    technicianCode: string | null;
    bedId: string | null;
    roomName: string | null;
    staffAssignments: any[];
    date: string;
}) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Update TurnQueue for each assigned staff
        for (const assignment of dispatchData.staffAssignments) {
            const { error: tError } = await supabase
                .from('TurnQueue')
                .update({
                    status: 'working',
                    current_order_id: bookingId,
                    turns_completed: assignment.turnsCompleted,
                    queue_position: assignment.queuePos,
                    estimated_end_time: assignment.endTime
                })
                .eq('employee_id', assignment.ktvId)
                .eq('date', dispatchData.date);

            if (tError) {
                console.error('❌ [Server] TurnQueue update error:', tError);
                throw tError;
            }
        }

        // 2. Update Booking
        const { error: bError } = await supabase
            .from('Bookings')
            .update({
                status: 'PREPARING',
                technicianCode: dispatchData.technicianCode,
                bedId: dispatchData.bedId,
                roomName: dispatchData.roomName,
                updatedAt: new Date().toISOString()
            })
            .eq('id', bookingId);

        if (bError) {
            console.error('❌ [Server] Booking update error:', bError);
            throw bError;
        }

        return { success: true };
    } catch (error: any) {
        console.error('❌ [Server] processDispatch error:', error);
        return { success: false, error: error.message };
    }
}
