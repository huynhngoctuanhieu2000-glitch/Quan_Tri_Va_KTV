'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function getPendingBooking(technicianCode: string) {
    if (!technicianCode) return { success: false, error: 'Technician code is required' };
    
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // Get the latest active booking for this specific technician
        const { data: booking, error: bError } = await supabase
            .from('Bookings')
            .select('*')
            .eq('technicianCode', technicianCode)
            .in('status', ['PREPARING', 'IN_PROGRESS'])
            .order('createdAt', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (bError) throw bError;
        if (!booking) return { success: true, data: null };

        // 2. Fetch BookingItems manually
        const { data: items, error: iError } = await supabase
            .from('BookingItems')
            .select('*')
            .eq('bookingId', booking.id);

        if (iError) console.error('Error fetching booking items:', iError);

        // 3. Fetch Service details (name, duration)
        let itemsWithService = items || [];
        if (items && items.length > 0) {
            const serviceIds = items.map((i: any) => i.serviceId).filter(Boolean);
            const { data: svcs } = await supabase
                .from('Services')
                .select('id, nameVN, nameEN, duration')
                .in('id', serviceIds);
            
            if (svcs) {
                const svcMap = new Map(svcs.map((s: any) => [s.id, s]));
                itemsWithService = items.map((i: any) => ({
                    ...i,
                    service_name: svcMap.get(i.serviceId)?.nameVN || svcMap.get(i.serviceId)?.nameEN || `Dịch vụ ${i.serviceId}`,
                    duration: svcMap.get(i.serviceId)?.duration || 60
                }));
            }
        }

        const data = {
            ...booking,
            BookingItems: itemsWithService
        };
        
        console.log(`🔍 [KTV] Fetching for ${technicianCode}:`, { 
            found: !!booking, 
            status: booking?.status,
            itemCount: itemsWithService.length
        });

        return { success: true, data };
    } catch (error: any) {
        console.error('Error in getPendingBooking action:', error);
        return { success: false, error: error.message };
    }
}

export async function updateBookingStatus(bookingId: string, status: string, additionalData?: any) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        const updatePayload: any = { status };
        if (status === 'IN_PROGRESS') {
            updatePayload.timeStart = new Date().toISOString();
        } else if (status === 'COMPLETED') {
            updatePayload.timeEnd = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('Bookings')
            .update(updatePayload)
            .eq('id', bookingId)
            .select()
            .single();

        if (error) {
            console.error('Error updating booking status:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data };
    } catch (error: any) {
        console.error('Error in updateBookingStatus action:', error);
        return { success: false, error: error.message };
    }
}
