import { SupabaseClient } from '@supabase/supabase-js';
import { TYPE_D_DISCIPLINE_PENALTIES } from '../constants/staff.constants';

export class KtvTypeDDisciplineService {
    /**
     * Deduct hours for general daily violations (absent, late) where booking_id is not applicable.
     */
    static async deductDailyViolation(
        supabase: SupabaseClient,
        staffId: string,
        date: string, // YYYY-MM-DD
        violationType: 'ABSENT_NO_NOTICE' | 'ABSENT_EARLY_NOTICE' | 'LATE_NO_UPDATE',
        note?: string
    ) {
        const hoursPenalty = TYPE_D_DISCIPLINE_PENALTIES[violationType];
        
        // Try insert
        const { error } = await supabase.from('KTVServiceHoursLedger').insert({
            staff_id: staffId,
            date: date,
            hours_earned: 0,
            hours_penalty: hoursPenalty,
            penalty_type: violationType,
            booking_id: null,
            note: note || `Vi phạm: ${violationType}`
        });

        // If unique violation (23505), update it
        if (error && error.code === '23505') {
            const { error: updateError } = await supabase.from('KTVServiceHoursLedger')
                .update({ hours_penalty: hoursPenalty, note: note || `Vi phạm: ${violationType}` })
                .eq('staff_id', staffId)
                .eq('date', date)
                .eq('penalty_type', violationType)
                .is('booking_id', null);
            if (updateError) throw updateError;
        } else if (error) {
            console.error('Error applying daily violation:', error);
            throw error;
        }
        return true;
    }

    /**
     * Deduct hours for rejecting a specific booking.
     * Uses booking_id to ensure idempotency.
     */
    static async deductOrderReject(
        supabase: SupabaseClient,
        staffId: string,
        date: string,
        bookingId: string,
        serviceDurationMins: number
    ) {
        // -3 times the duration of the service
        const hoursPenalty = (serviceDurationMins / 60) * TYPE_D_DISCIPLINE_PENALTIES.ORDER_REJECT_MULTIPLIER;
        
        const { error } = await supabase.from('KTVServiceHoursLedger').insert({
            staff_id: staffId,
            date: date,
            hours_earned: 0,
            hours_penalty: hoursPenalty,
            penalty_type: 'ORDER_REJECT',
            booking_id: bookingId,
            note: `Từ chối tua: ${bookingId} (${serviceDurationMins} phút)`
        });

        if (error && error.code === '23505') {
            const { error: updateError } = await supabase.from('KTVServiceHoursLedger')
                .update({ hours_penalty: hoursPenalty })
                .eq('staff_id', staffId)
                .eq('date', date)
                .eq('booking_id', bookingId);
            if (updateError) throw updateError;
        } else if (error) {
            console.error('Error applying order reject violation:', error);
            throw error;
        }
        return true;
    }
}
