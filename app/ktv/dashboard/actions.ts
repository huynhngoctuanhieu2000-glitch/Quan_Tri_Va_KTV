'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function getPendingBooking(branchCode: string = '11NDK') {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // Get the oldest NEW booking for this branch
        // Assuming we just get any NEW booking for demo purposes
        const { data, error } = await supabase
            .from('Bookings')
            .select(`
        *,
        BookingItems (*)
      `)
            .eq('status', 'NEW')
            .order('createdAt', { ascending: true })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is no rows returned, which is fine
            console.error('Error fetching pending booking:', error);
            return { success: false, error: error.message };
        }

        if (!data) return { success: true, data: null };

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
            updatePayload.actual_start_time = new Date().toISOString();
        } else if (status === 'COMPLETED') {
            updatePayload.actual_end_time = new Date().toISOString();
            if (additionalData?.customerProfile) {
                updatePayload.customerProfile = additionalData.customerProfile;
            }
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
