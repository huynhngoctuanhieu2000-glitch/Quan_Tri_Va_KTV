import { getSupabaseAdmin } from './supabaseAdmin';

export async function syncTurnsForDate(date: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase not initialized');

        // 1. Nhóm và đếm số lượng tua từ TurnLedger trong ngày
        const { data: ledgers, error: ledgerError } = await supabase
            .from('TurnLedger')
            .select('employee_id')
            .eq('date', date);

        if (ledgerError) throw ledgerError;

        // Gom nhóm theo employee_id
        const turnsCount: Record<string, number> = {};
        (ledgers || []).forEach(ledger => {
            const empId = ledger.employee_id;
            if (empId) {
                turnsCount[empId] = (turnsCount[empId] || 0) + 1;
            }
        });

        // 2. Cập nhật vào TurnQueue
        // Lấy tất cả KTV đang có trong TurnQueue ngày hôm nay
        const { data: queues, error: qError } = await supabase
            .from('TurnQueue')
            .select('id, employee_id, turns_completed')
            .eq('date', date);

        if (qError) throw qError;

        // Cập nhật lại số tua cho những người có sự thay đổi
        if (queues && queues.length > 0) {
            for (const q of queues) {
                const actualCount = turnsCount[q.employee_id] || 0;
                if (q.turns_completed !== actualCount) {
                    await supabase
                        .from('TurnQueue')
                        .update({ turns_completed: actualCount })
                        .eq('id', q.id);
                }
            }
        }

        return true;
    } catch (error) {
        console.error('Turn Sync Error:', error);
        return false;
    }
}
