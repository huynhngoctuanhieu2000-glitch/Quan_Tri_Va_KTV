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
        // Cập nhật lại số tua cho tất cả những người có trong Ledger của ngày này
        const employeeIds = Object.keys(turnsCount);
        if (employeeIds.length > 0) {
            for (const empId of employeeIds) {
                const actualCount = turnsCount[empId];
                
                const { error: upsertError } = await supabase
                    .from('TurnQueue')
                    .upsert({
                        employee_id: empId,
                        date: date,
                        turns_completed: actualCount,
                        // Nếu là chèn mới, mặc định là 'waiting' hoặc 'off' tùy context
                        // Ở đây ta giữ nguyên status cũ nếu có, hoặc để 'waiting' nếu mới
                    }, { onConflict: 'employee_id,date' });

                if (upsertError) {
                    console.error(`[Sync] Upsert failed for ${empId}:`, upsertError.message);
                }
            }
        }

        return true;
    } catch (error) {
        console.error('Turn Sync Error:', error);
        return false;
    }
}
