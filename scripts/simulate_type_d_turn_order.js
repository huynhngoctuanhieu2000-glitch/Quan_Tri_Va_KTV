const { createClient } = require('@supabase/supabase-js');
const assert = require('assert');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

class KtvTypeDTurnService {
    static async getTurnQueue(supabase, date) {
        const { data: queueData, error: queueError } = await supabase
            .from('TurnQueue')
            .select('*, Staff!inner (id, work_type, work_type_effective_from)')
            .eq('date', date)
            .eq('Staff.work_type', 'TYPE_D');

        if (queueError) throw queueError;
        if (!queueData || queueData.length === 0) return [];

        const staffIds = queueData.map(q => q.employee_id);

        const now = new Date();
        const firstDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];

        const { data: ledgerData, error: ledgerError } = await supabase
            .from('KTVServiceHoursLedger')
            .select('staff_id, date, hours_earned, hours_penalty')
            .in('staff_id', staffIds)
            .gte('date', firstDayOfMonth);

        if (ledgerError) throw ledgerError;

        const staffHoursMap = {};
        for (const staffId of staffIds) {
            staffHoursMap[staffId] = 0;
        }

        if (ledgerData) {
            for (const row of ledgerData) {
                const staff = queueData.find(q => q.employee_id === row.staff_id)?.Staff;
                if (!staff) continue;
                const effectiveDate = staff.work_type_effective_from || '2020-01-01';
                if (row.date >= effectiveDate) {
                    const earned = Number(row.hours_earned) || 0;
                    const penalty = Number(row.hours_penalty) || 0;
                    staffHoursMap[row.staff_id] += (earned - penalty);
                }
            }
        }

        const enrichedQueue = queueData.map(q => ({
            ...q,
            monthly_hours: staffHoursMap[q.employee_id] || 0
        }));

        enrichedQueue.sort((a, b) => {
            if (b.monthly_hours !== a.monthly_hours) {
                return b.monthly_hours - a.monthly_hours; // DESC
            }
            return (a.check_in_order || 0) - (b.check_in_order || 0); // ASC
        });

        return enrichedQueue;
    }
}

async function runTest() {
    const date = '2026-09-01';

    try {
        console.log("Running turn order assertions...");
        
        // Clean up first just in case
        await supabase.from('KTVServiceHoursLedger').delete().like('staff_id', 'T%');
        await supabase.from('TurnQueue').delete().eq('date', date);

        // Insert mock TurnQueue items
        await supabase.from('TurnQueue').insert([
            { date, employee_id: 'T001', check_in_order: 1, status: 'waiting' },
            { date, employee_id: 'T002', check_in_order: 2, status: 'working' },
            { date, employee_id: 'T011', check_in_order: 3, status: 'waiting' }
        ]);

        // Insert ledger hours WITH booking_id to prevent null/null orphaned rows outside unique constraints
        await supabase.from('KTVServiceHoursLedger').insert([
            { staff_id: 'T001', date: '2026-09-01', hours_earned: 5, booking_id: 'TEST-B1' },
            { staff_id: 'T002', date: '2026-09-01', hours_earned: 10, booking_id: 'TEST-B2' },
            { staff_id: 'T011', date: '2026-09-01', hours_earned: 8, hours_penalty: 3, booking_id: 'TEST-B3' }
        ]);

        const result = await KtvTypeDTurnService.getTurnQueue(supabase, date);

        // Asserts
        const expectedOrder = ['T002', 'T011', 'T001'];
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0].employee_id, 'T002');
        assert.strictEqual(result[0].monthly_hours, 10);
        assert.strictEqual(result[1].employee_id, 'T001');
        assert.strictEqual(result[1].monthly_hours, 5);
        assert.strictEqual(result[2].employee_id, 'T011');
        assert.strictEqual(result[2].monthly_hours, 5);

        console.log("All turn order assertions passed.");
    } catch (e) {
        console.error(e);
        process.exit(1);
    } finally {
        // ALWAYS CLEAN UP DB
        await supabase.from('KTVServiceHoursLedger').delete().like('staff_id', 'T%');
        await supabase.from('TurnQueue').delete().eq('date', date);
    }
}

runTest();
