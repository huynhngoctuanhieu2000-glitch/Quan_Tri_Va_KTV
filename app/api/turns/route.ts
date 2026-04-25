import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

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
            .gte('createdAt', fromFilter)
            .lte('createdAt', toFilter);
            
        const bookingIds = (bookings || []).map(b => b.id);
        
        // Tạo map trạng thái Booking cha để fallback
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
                    // Tính tua khi: item COMPLETED/DONE HOẶC Booking cha đã COMPLETED/DONE
                    const itemDone = ['COMPLETED', 'DONE'].includes(item.status);
                    const bookingDone = ['COMPLETED', 'DONE'].includes(bookingStatusMap.get(item.bookingId) || '');
                    
                    if (!itemDone && !bookingDone) continue;
                    
                    if (item.technicianCodes && Array.isArray(item.technicianCodes)) {
                        for (const ktvId of item.technicianCodes) {
                            if (!ktvBills.has(ktvId)) {
                                ktvBills.set(ktvId, new Set<string>());
                            }
                            ktvBills.get(ktvId)!.add(item.bookingId);
                        }
                    }
                }
                
                for (const [ktvId, bills] of ktvBills.entries()) {
                    realTurnsMap[ktvId] = bills.size;
                }
            }
        }

        // Ghi đè turns_completed bằng số bill thực tế
        const mappedData = data?.map(turn => ({
            ...turn,
            turns_completed: realTurnsMap[turn.employee_id] || 0
        }));

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

        return NextResponse.json({ success: true, data: mappedData });
    } catch (error: any) {
        console.error('API Error (Turns):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
