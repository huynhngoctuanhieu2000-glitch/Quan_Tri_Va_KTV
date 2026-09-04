import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getBusinessToday } from '@/lib/business-date';

export const dynamic = 'force-dynamic';

/**
 * ================================================================
 * LƯỚI AN TOÀN cho auto-finish
 * ================================================================
 * Việc tự động kết thúc tua hiện chạy trong `useEffect` ở TRÌNH DUYỆT của
 * lễ tân (KanbanBoard.tsx). Không ai mở màn hình điều phối thì tua treo mãi
 * ở IN_PROGRESS / CLEANING — kéo theo tiền và giờ của KTV không được chốt.
 *
 * Cron này KHÔNG thay thế logic đó. Logic ở client dựa vào cả bộ view-model
 * của màn hình điều phối (calculatedStart, timeline nối tiếp...) nên chính
 * xác hơn nhiều; chép sang server sẽ phải chép luôn tầng dựng view và rất dễ
 * lệch. Cron chỉ VỚT những đơn bị kẹt, bằng luật đơn giản đọc thẳng từ DB.
 *
 * ⏱️ ÂN HẠN: mọi mốc đều cộng thêm GRACE_MINUTES. Khi có người mở màn hình,
 * client luôn ra tay trước — server không bao giờ tranh việc và không bao giờ
 * kết thúc tua sớm hơn dự kiến.
 *
 * Dùng lại đúng `updateBookingItemStatus` mà màn hình điều phối đang dùng,
 * để không đẻ thêm một đường chuyển trạng thái thứ ba.
 *
 * GET  ?dry=1  → chỉ liệt kê, KHÔNG đụng gì
 */

/** Ân hạn để client luôn được ưu tiên xử lý trước. */
const GRACE_MINUTES = 15;
/** Không đụng tới đơn quá cũ — đó là rác lịch sử, cần người xem. */
const MAX_AGE_HOURS = 24;

const IN_PROGRESS_STATUSES = ['IN_PROGRESS'];
const CLEANING_STATUSES = ['CLEANING'];

function parseSegments(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
    } catch { return []; }
}

/**
 * Thời điểm tua này lẽ ra đã xong = max(actualStartTime + duration) trên các
 * segment. Trả null nếu chưa segment nào bắt đầu (chưa tính là kẹt).
 */
function expectedEndMs(segments: any[]): number | null {
    let max: number | null = null;
    for (const seg of segments) {
        if (!seg?.actualStartTime) continue;
        const start = new Date(seg.actualStartTime).getTime();
        if (!Number.isFinite(start)) continue;
        const mins = Number(seg.duration) || 60;
        const end = start + mins * 60000;
        if (max === null || end > max) max = end;
    }
    return max;
}

/**
 * Thời điểm KTV bấm xong = max(actualEndTime) trên các segment — cũng chính là
 * lúc bắt đầu dọn phòng.
 *
 * ⚠️ KHÔNG dùng `updatedAt`: BookingItems KHÔNG CÓ cột đó (chỉ Bookings mới có).
 * Mà `Bookings.updatedAt` là cấp bill, bị đổi bởi bất kỳ thay đổi nào của bill,
 * nên cũng không phản ánh đúng lúc item này xong.
 */
function cleaningSinceMs(segments: any[]): number | null {
    let max: number | null = null;
    for (const seg of segments) {
        if (!seg?.actualEndTime) continue;
        const t = new Date(seg.actualEndTime).getTime();
        if (!Number.isFinite(t)) continue;
        if (max === null || t > max) max = t;
    }
    return max;
}

const isPaused = (segments: any[]) => segments.some((s: any) => s?.pauseStart);
const allSegmentsEnded = (segments: any[]) => {
    const started = segments.filter((s: any) => s?.actualStartTime);
    return started.length > 0 && started.every((s: any) => s?.actualEndTime);
};

async function run(dryRun: boolean) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ success: false, error: 'Supabase not init' }, { status: 500 });

    const now = Date.now();
    const graceMs = GRACE_MINUTES * 60000;
    const businessToday = await getBusinessToday(supabase);

    const { data: cfgRows } = await supabase
        .from('SystemConfigs').select('key, value')
        .in('key', ['room_transition_time', 'thoi_gian_doi_phong']);
    const rawTransition = (cfgRows || [])[0]?.value;
    const roomTransitionTime = parseInt(String(rawTransition ?? '').replace(/"/g, ''), 10) || 5;

    // ⚠️ Phải lọc theo BookingItems.status, KHÔNG phải Bookings.status.
    // Bill có thể đã DONE trong khi item con vẫn kẹt ở CLEANING — đó chính là
    // dạng kẹt phổ biến nhất, lọc theo bill sẽ bỏ sót hết.
    const since = new Date(now - MAX_AGE_HOURS * 3600_000).toISOString();
    const { data: stuckItems, error } = await supabase
        .from('BookingItems')
        .select(`
            id, bookingId, status, segments, technicianCodes,
            Bookings!fk_bookingitems_booking ( id, billCode, status, rating, timeStart )
        `)
        .in('status', [...IN_PROGRESS_STATUSES, ...CLEANING_STATUSES])
        .limit(2000);

    if (error) throw error;

    // Gom về từng bill, và CHỈ xử lý đơn còn mới.
    // Tồn đọng cũ (có đơn kẹt hàng trăm giờ) cố ý không đụng: đóng chúng lúc
    // này sẽ ghi tiền/giờ vào những ngày đã chốt sổ từ lâu. Cần người xem.
    const byBooking = new Map<string, any>();
    let skippedOld = 0;
    for (const it of stuckItems || []) {
        const b: any = (it as any).Bookings;
        if (!b || b.status === 'CANCELLED') continue;
        if (!b.timeStart || new Date(b.timeStart + 'Z').getTime() < new Date(since).getTime()) {
            skippedOld++;
            continue;
        }
        const entry = byBooking.get(b.id) || { ...b, BookingItems: [] };
        entry.BookingItems.push(it);
        byBooking.set(b.id, entry);
    }
    const bookings = [...byBooking.values()];

    type Action = {
        bookingId: string; billCode: string | null; itemIds: string[];
        from: string; to: string; ktvIds: string[]; overdueMins: number; reason: string;
    };
    const actions: Action[] = [];

    for (const b of bookings) {
        const items = (b as any).BookingItems || [];

        // ── IN_PROGRESS quá giờ → CLEANING ──────────────────────────
        const stuckRunning = items.filter((it: any) => {
            if (!IN_PROGRESS_STATUSES.includes(String(it.status))) return false;
            const segs = parseSegments(it.segments);
            if (segs.length === 0) return false;
            if (isPaused(segs)) return false;              // đang tạm dừng — không đụng
            const end = expectedEndMs(segs);
            if (end === null) return false;                // chưa ai bắt đầu
            return now >= end + graceMs;
        });

        if (stuckRunning.length > 0) {
            const end = expectedEndMs(parseSegments(stuckRunning[0].segments))!;
            actions.push({
                bookingId: b.id, billCode: b.billCode,
                itemIds: stuckRunning.map((i: any) => i.id),
                from: 'IN_PROGRESS', to: 'CLEANING',
                ktvIds: [...new Set(stuckRunning.flatMap((i: any) => i.technicianCodes || []))] as string[],
                overdueMins: Math.round((now - end) / 60000),
                reason: `quá giờ dự kiến ${Math.round((now - end) / 60000)} phút`,
            });
            continue; // mỗi bill chỉ đẩy 1 bước / lượt chạy
        }

        // ── CLEANING quá lâu → FEEDBACK / DONE ──────────────────────
        const stuckCleaning = items.filter((it: any) => {
            if (!CLEANING_STATUSES.includes(String(it.status))) return false;
            const segs = parseSegments(it.segments);
            if (!allSegmentsEnded(segs)) return false;
            const touched = cleaningSinceMs(segs);
            if (touched === null) return false;
            return now >= touched + roomTransitionTime * 60000 + graceMs;
        });

        if (stuckCleaning.length > 0) {
            const touched = cleaningSinceMs(parseSegments(stuckCleaning[0].segments))!;
            const hasRating = (b as any).rating != null;
            actions.push({
                bookingId: b.id, billCode: b.billCode,
                itemIds: stuckCleaning.map((i: any) => i.id),
                from: 'CLEANING', to: hasRating ? 'DONE' : 'FEEDBACK',
                ktvIds: [...new Set(stuckCleaning.flatMap((i: any) => i.technicianCodes || []))] as string[],
                overdueMins: Math.round((now - touched) / 60000),
                reason: hasRating ? 'dọn phòng xong, khách đã chấm sao' : 'dọn phòng xong, chờ khách chấm sao',
            });
        }
    }

    if (dryRun) {
        return NextResponse.json({
            success: true, dryRun: true,
            graceMinutes: GRACE_MINUTES, roomTransitionTime, businessToday,
            scanned: bookings.length,
            skippedOldBacklog: skippedOld,
            wouldChange: actions.length,
            actions,
        });
    }

    const { updateBookingItemStatus } = await import('@/app/reception/dispatch/actions');
    const done: any[] = [];
    const failed: any[] = [];

    for (const a of actions) {
        try {
            await updateBookingItemStatus(
                a.itemIds, a.to, businessToday, a.bookingId,
                a.ktvIds.length > 0 ? a.ktvIds : undefined,
                false, undefined,
                { systemActor: true },
            );
            console.log(`[AutoFinish] ${a.billCode} ${a.from}→${a.to} (${a.reason})`);
            done.push({ bill: a.billCode, from: a.from, to: a.to, reason: a.reason });
        } catch (e: any) {
            console.error(`[AutoFinish] LỖI ${a.billCode}:`, e?.message);
            failed.push({ bill: a.billCode, error: e?.message });
        }
    }

    return NextResponse.json({
        success: true,
        scanned: bookings.length,
        skippedOldBacklog: skippedOld,
        changed: done.length,
        failedCount: failed.length,
        done,
        failed,
    });
}

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    try {
        const dry = new URL(request.url).searchParams.get('dry') === '1';
        return await run(dry);
    } catch (err: any) {
        console.error('Exception in auto-finish-services:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export const POST = GET;
