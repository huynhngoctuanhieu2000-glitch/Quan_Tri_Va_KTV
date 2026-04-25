import { getSupabaseAdmin } from './supabaseAdmin';

export async function syncTurnsForDate(date: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase not initialized');

        const { data, error } = await supabase
            .from('TurnQueue')
            .select('*')
            .eq('date', date)
            .order('queue_position', { ascending: true });

        if (error) throw error;

        // Lấy danh sách Bookings trong ngày để tính số bill thực tế
        const fromFilter = `${date}T00:00:00`;
        const toFilter = `${date}T23:59:59`;
        
        const { data: bookings } = await supabase
            .from('Bookings')
            .select('id, status')
            .gte('bookingDate', fromFilter)
            .lte('bookingDate', toFilter);
            
        const bookingIds = (bookings || []).map(b => b.id);
        const bookingStatusMap = new Map<string, string>();
        for (const b of bookings || []) {
            bookingStatusMap.set(b.id, b.status);
        }
        
        let realTurnsMap: Record<string, number> = {};
        
        if (bookingIds.length > 0) {
            const { data: items } = await supabase
                .from('BookingItems')
                .select('bookingId, technicianCodes, status')
                .in('bookingId', bookingIds);
                
            if (items) {
                const ktvBills = new Map<string, Set<string>>();
                
                for (const item of items) {
                    const bookingStatus = bookingStatusMap.get(item.bookingId) || '';
                    if (bookingStatus === 'CANCELLED') continue;

                    if (item.technicianCodes && Array.isArray(item.technicianCodes)) {
                        for (const rawCode of item.technicianCodes) {
                            if (!rawCode) continue;
                            const ktvIds = typeof rawCode === 'string' 
                                ? rawCode.split(',').map(s => s.trim()).filter(Boolean) 
                                : [rawCode];
                            for (const ktvId of ktvIds) {
                                if (!ktvBills.has(ktvId)) {
                                    ktvBills.set(ktvId, new Set<string>());
                                }
                                ktvBills.get(ktvId)!.add(item.bookingId);
                            }
                        }
                    }
                }
                
                for (const [ktvId, bills] of ktvBills.entries()) {
                    realTurnsMap[ktvId] = bills.size;
                }
            }
        }

        // 🔄 Sync: Ghi ngược giá trị đã tính vào DB để Supabase dashboard luôn chính xác
        if (data && data.length > 0) {
            const updates = data
                .filter(turn => (realTurnsMap[turn.employee_id] || 0) !== turn.turns_completed)
                .map(turn => 
                    supabase.from('TurnQueue')
                        .update({ turns_completed: realTurnsMap[turn.employee_id] || 0 })
                        .eq('id', turn.id)
                );
            if (updates.length > 0) {
                await Promise.all(updates);
            }
        }

        return true;
    } catch (error) {
        console.error('Turn Sync Error:', error);
        return false;
    }
}
