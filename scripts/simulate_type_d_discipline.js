const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const TYPE_D_DISCIPLINE_PENALTIES = {
    ABSENT_NO_NOTICE: 10,
    ABSENT_EARLY_NOTICE: 5,
    LATE_NO_UPDATE: 5,
    ORDER_REJECT_MULTIPLIER: 3
};

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

class KtvTypeDDisciplineService {
    static async deductDailyViolation(supabase, staffId, date, violationType, note) {
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
            await supabase.from('KTVServiceHoursLedger')
                .update({ hours_penalty: hoursPenalty, note: note || `Vi phạm: ${violationType}` })
                .eq('staff_id', staffId)
                .eq('date', date)
                .eq('penalty_type', violationType)
                .is('booking_id', null);
        } else if (error) {
            throw error;
        }
    }

    static async deductOrderReject(supabase, staffId, date, bookingId, serviceDurationMins) {
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
            await supabase.from('KTVServiceHoursLedger')
                .update({ hours_penalty: hoursPenalty })
                .eq('staff_id', staffId)
                .eq('date', date)
                .eq('booking_id', bookingId);
        } else if (error) {
            throw error;
        }
    }
}

const assert = require('assert');

async function runTest() {
    const staffId = 'T001';
    const date = '2026-09-01';

    try {
        console.log("Running discipline assertions...");
        // Clear previous
        await supabase.from('KTVServiceHoursLedger').delete().eq('staff_id', staffId).eq('date', date);

        await KtvTypeDDisciplineService.deductDailyViolation(supabase, staffId, date, 'ABSENT_NO_NOTICE');
        await KtvTypeDDisciplineService.deductDailyViolation(supabase, staffId, date, 'ABSENT_NO_NOTICE'); // Idempotent
        await KtvTypeDDisciplineService.deductOrderReject(supabase, staffId, date, 'BKG-001', 60);
        await KtvTypeDDisciplineService.deductOrderReject(supabase, staffId, date, 'BKG-001', 60); // Idempotent

        // Fetch to verify
        const { data } = await supabase.from('KTVServiceHoursLedger').select('*').eq('staff_id', staffId).eq('date', date).order('penalty_type');
        
        assert.strictEqual(data.length, 2);
        
        const absentViolation = data.find(d => d.penalty_type === 'ABSENT_NO_NOTICE');
        assert.ok(absentViolation);
        assert.strictEqual(absentViolation.hours_penalty, 10);
        assert.strictEqual(absentViolation.booking_id, null);

        const rejectViolation = data.find(d => d.penalty_type === 'ORDER_REJECT');
        assert.ok(rejectViolation);
        assert.strictEqual(rejectViolation.hours_penalty, 3);
        assert.strictEqual(rejectViolation.booking_id, 'BKG-001');

        console.log("All discipline assertions passed.");
    } catch (e) {
        console.error(e);
        process.exit(1);
    } finally {
        // ALWAYS CLEAN UP DB
        await supabase.from('KTVServiceHoursLedger').delete().eq('staff_id', staffId).eq('date', date);
    }
}

runTest();
