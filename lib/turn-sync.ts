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

        // 🛑 BƯỚC 1 REFACTOR: NGỪNG TÍNH TUA TỪ BookingItems.technicianCodes
        // Hàm này trước đây quét technicianCodes (chứa cả dữ liệu draft/pre-assign) và ghi đè TurnQueue.turns_completed
        // Điều này gây ra lỗi nhảy tua ngay cả khi Lễ tân chỉ lưu nháp.
        // Tương lai: Logic đếm tua sẽ được truy vấn từ bảng TurnLedger độc lập.
        
        return true;
    } catch (error) {
        console.error('Turn Sync Error:', error);
        return false;
    }
}
