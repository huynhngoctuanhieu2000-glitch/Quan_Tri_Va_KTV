import { SupabaseClient } from '@supabase/supabase-js';
import { KtvTypeDCommissionService } from './KtvTypeDCommissionService';
import { KtvTypeDBonusService } from './KtvTypeDBonusService';

/**
 * Dòng KHÔNG phải lệnh rút tiền thật:
 *  · `intent_date` khác null — tín hiệu "báo trước lúc điểm danh"
 *  · amount = 1 kèm ghi chú "Báo trước" — dòng cũ chưa gắn intent_date
 *  · amount = 1 kèm ghi chú "Bảo trì"   — dòng kỹ thuật
 */
function laDongTinHieu(w: any): boolean {
    if (w.intent_date) return true;
    if (Math.abs(Number(w.amount)) !== 1) return false;
    const note = String(w.note || '');
    return note.includes('Báo trước') || note.includes('Bảo trì');
}

export class KtvTypeDWalletService {
    static async getBalance(supabase: SupabaseClient, staffId: string) {
        const GLOBAL_START_DATE_STR = '2026-05-04';
        const GLOBAL_START_DATE_ISO = '2026-05-04T00:00:00.000Z';
        const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
        
        const { data: configsData } = await supabase.from('SystemConfigs').select('key, value').ilike('key', '%type_d%');
        const configs: Record<string, any> = {};
        (configsData || []).forEach((c: any) => { configs[c.key] = c.value; });

        const taxEffectiveDate = configs['ktv_type_d_tax_effective_from'] || '2099-01-01';
        let total_tax_deducted = 0;

        const rateVIP = Number(configs['ktv_type_d_vip_rate_per_60m']) || 180000;
        const ratePT = Number(configs['ktv_type_d_pt_rate_per_60m']) || 100000;
        
        let ratingDeductions = { "0": 0, "1": 0.75, "2": 0.5, "3": 0.25, "4": 0 };
        try {
            if (configs['ktv_type_d_rating_deduction']) {
                ratingDeductions = typeof configs['ktv_type_d_rating_deduction'] === 'string' 
                    ? JSON.parse(configs['ktv_type_d_rating_deduction']) 
                    : configs['ktv_type_d_rating_deduction'];
            }
        } catch (e) {}

        const basePoints = Number(configs['ktv_type_d_bonus_points']) || 20;
        const pointRate = Number(configs['ktv_bonus_rate_TYPE_D']) || 1000;
        const enableBonus = configs['enable_ktv_bonus_TYPE_D'] === true || configs['enable_ktv_bonus_TYPE_D'] === 'true';
        const minDeposit = Number(configs['ktv_deposit_amount_TYPE_D']) || 1000000;

        const nowVnDate = new Date(Date.now() + VN_OFFSET_MS);
        const todayStr = nowVnDate.toISOString().split('T')[0];

        const { data: ledgers } = await supabase
            .from('KTVDailyLedger')
            .select('date, total_commission, total_tip, total_bonus, total_penalty')
            .eq('staff_id', staffId)
            .eq('work_type_snapshot', 'TYPE_D')
            .gte('date', GLOBAL_START_DATE_STR);

        let realtimeStartStr = `${GLOBAL_START_DATE_STR}T00:00:00+07:00`;
        const ledgerSummary = { comm: 0, tip: 0, bonus: 0, penalty: 0 };

        if (ledgers && ledgers.length > 0) {
            const pastLedgers = ledgers.filter((l: any) => l.date < todayStr);
            if (pastLedgers.length > 0) {
                let maxDateStr = pastLedgers[0].date;
                pastLedgers.forEach((l: any) => {
                    if (l.date > maxDateStr) maxDateStr = l.date;
                    
                    // ⚠️ CHỈ lấy THƯỞNG từ sổ cũ. Tiền tua, tip và thuế phần hoa
                    // hồng nay đọc từ KTVDTurnLedger (xem bên dưới) — thưởng thì
                    // chưa, vì thưởng tính theo KHÁCH nên không thuộc tầng đơn.
                    let dayBonus = Number(l.total_bonus || 0) * pointRate;

                    if (l.date >= taxEffectiveDate) {
                        const taxBonus = dayBonus * 0.1;
                        total_tax_deducted += taxBonus;
                        dayBonus -= taxBonus;
                    }

                    ledgerSummary.bonus += dayBonus;
                    ledgerSummary.penalty += Number(l.total_penalty || 0);
                });

                const lastDateMs = new Date(`${maxDateStr}T00:00:00+07:00`).getTime();
                const nextDateVn = new Date(lastDateMs + 24 * 60 * 60 * 1000 + VN_OFFSET_MS);
                const nextDateStr = nextDateVn.toISOString().split('T')[0];
                realtimeStartStr = `${nextDateStr}T00:00:00+07:00`;
            }
        }

        let allBookingItems: any[] = [];
        let page = 0;
        const pageSize = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('BookingItems')
                .select(`
                    id, serviceId, technicianCodes, segments, status, tip, itemRating, ktvRatings, options, handover_status, handover_comment,
                    Bookings!inner ( id, timeStart, status, billCode, createdAt, rating )
                `)
                .contains('technicianCodes', [staffId])
                .gte('Bookings.timeStart', realtimeStartStr)
                .range(page * pageSize, (page + 1) * pageSize - 1);
                
            if (error || !data || data.length === 0) break;
            allBookingItems = allBookingItems.concat(data);
            page++;
        }

        const bookingsMap: Record<string, any> = {};
        allBookingItems.forEach(item => {
            const b = item.Bookings;
            if (!bookingsMap[b.id]) {
                bookingsMap[b.id] = { ...b, BookingItems: [] };
            }
            const cleanItem = { ...item };
            delete cleanItem.Bookings;
            bookingsMap[b.id].BookingItems.push(cleanItem);
        });
        const allBookings = Object.values(bookingsMap);

        const { data: services } = await supabase.from('Services').select('id, is_utility');
        const svcIsUtilityMap: Record<string, boolean> = {};
        (services || []).forEach((s: any) => { svcIsUtilityMap[String(s.id)] = !!s.is_utility; });

        const allTechCodes = new Set<string>();
        allBookings.forEach((b: any) => {
            (b.BookingItems || []).forEach((i: any) => {
                if (i.technicianCodes && Array.isArray(i.technicianCodes)) {
                    i.technicianCodes.forEach((tc: string) => allTechCodes.add(tc));
                }
            });
        });
        const { data: allTechData } = await supabase.from('Staff').select('id, work_type').in('id', Array.from(allTechCodes));
        const techWorkTypeMap: Record<string, string> = {};
        (allTechData || []).forEach((t: any) => { techWorkTypeMap[t.id.toLowerCase()] = t.work_type; });

        let rt_bonus = 0;

        for (const b of allBookings) {
            const relevantItemsOriginal = (b.BookingItems || []).filter((i: any) =>
                i.technicianCodes && Array.isArray(i.technicianCodes) &&
                i.technicianCodes.some((tc: string) => tc.toLowerCase().includes(staffId.toLowerCase())) &&
                ['DONE', 'COMPLETED', 'CLEANING', 'FEEDBACK'].includes(i.status)
            );

            let relevantItems = relevantItemsOriginal.filter((i: any) => !svcIsUtilityMap[String(i.serviceId)]);
            if (relevantItems.length === 0 && relevantItemsOriginal.length > 0) {
                relevantItems = relevantItemsOriginal;
            }

            if (relevantItems.length === 0) continue;

            // Vòng lặp này giờ CHỈ tính THƯỞNG. Tiền tua và tip đọc từ
            // KTVDTurnLedger để khớp tuyệt đối với lịch sử.
            if (enableBonus) {
                const ktvWorkTypesForGuest: string[] = [];
                (b.BookingItems || []).forEach((i: any) => {
                    if (i.technicianCodes && Array.isArray(i.technicianCodes)) {
                        i.technicianCodes.forEach((tc: string) => {
                            const wt = techWorkTypeMap[tc.toLowerCase()] || 'TYPE_A';
                            // Wait, logic in Bonus says: ktvWorkTypes array of all KTVs that served this guest
                            // KtvTypeDBonusService will check if any has != 'TYPE_D'.
                            ktvWorkTypesForGuest.push(wt);
                        });
                    }
                });
                
                rt_bonus += KtvTypeDBonusService.calculateBonusForTypeD(
                    ktvWorkTypesForGuest,
                    b.rating,
                    basePoints,
                    pointRate
                );
            }
        }

        if (todayStr >= taxEffectiveDate) {
            const rtTaxBonus = rt_bonus * 0.1;
            total_tax_deducted += rtTaxBonus;
            rt_bonus -= rtTaxBonus;
        }

        const { data: adjustments } = await supabase
            .from('WalletAdjustments')
            .select('amount')
            .eq('staff_id', staffId)
            .eq('work_type_snapshot', 'TYPE_D')
            .gte('created_at', GLOBAL_START_DATE_ISO);
        const total_adjustment = (adjustments || []).reduce((sum: number, a: any) => sum + Number(a.amount), 0);

        // ⚠️ Loại DÒNG TÍN HIỆU "báo trước lúc điểm danh" (amount = 1) khỏi số dư.
        // Nó chỉ để báo Thu ngân chuẩn bị tiền mặt, không phải lệnh rút thật —
        // trước đây mỗi dòng như vậy trừ oan 1đ, và có ngày KTV tích tới 3 lần.
        const { data: withdrawals } = await supabase
            .from('KTVWithdrawals')
            .select('amount, status, note, intent_date')
            .eq('staff_id', staffId)
            .eq('work_type_snapshot', 'TYPE_D')
            .gte('request_date', GLOBAL_START_DATE_ISO);
            
        const total_withdrawn = (withdrawals || [])
            .filter((w: any) => w.status === 'APPROVED' && !laDongTinHieu(w))
            .reduce((sum: number, w: any) => sum + Math.abs(Number(w.amount)), 0);
            
        const total_pending = (withdrawals || [])
            .filter((w: any) => w.status === 'PENDING' && !laDongTinHieu(w))
            .reduce((sum: number, w: any) => sum + Math.abs(Number(w.amount)), 0);

        // ─── TIỀN TUA · TIP · THUẾ: đọc từ sổ cái ──────────────────────────
        // Cùng nguồn với màn hình lịch sử, nên KTV cộng tay các dòng lịch sử
        // luôn ra đúng số trong ví. Sổ cái lưu KHÔNG làm tròn.
        const { getRows, sumByStaff } = await import('./KtvDLedgerReader');
        const allTurnRows = await getRows(supabase, {
            staffIds: [staffId],
            from: GLOBAL_START_DATE_STR,
            to: '2099-12-31',
        });

        // ⚠️ TUA CHƯA CÓ ĐÁNH GIÁ THÌ CHƯA TÍNH TIỀN.
        // Quy chế: không có cơ sở tính tiền tua mà khách bỏ về không đánh giá.
        // Đường thoát: khách lười chấm thì lễ tân bấm "đã đánh giá" hoặc kéo
        // sang cột hoàn tất trên bảng điều phối — item về DONE là hết tạm tính.
        //
        // Trước đây ví cộng cả tiền tạm tính trong khi lịch sử thì ẩn đi, nên
        // hai màn hình nói hai chuyện khác nhau. Giờ cả hai cùng loại.
        const emptyTotals = { commission_net: 0, tax_amount: 0, take_home: 0, tip: 0, hours: 0, turns: 0 };
        const turnRows = allTurnRows.filter(r => !r.is_provisional);
        const provisionalRows = allTurnRows.filter(r => r.is_provisional);

        const turnTotals = sumByStaff(turnRows)[staffId] || emptyTotals;
        const provisionalTotals = sumByStaff(provisionalRows)[staffId] || emptyTotals;

        total_tax_deducted += turnTotals.tax_amount;

        const total_commission = turnTotals.take_home;   // đã trừ thuế
        const total_tip = turnTotals.tip;
        const total_bonus = ledgerSummary.bonus + rt_bonus;
        const total_penalty = 0; 

        const gross_income = total_commission + total_adjustment;
        const net_balance = gross_income - total_withdrawn - total_pending;
        const available_balance = Math.max(0, net_balance - minDeposit);
        const effective_balance = Math.max(0, net_balance);

        return {
            total_commission,
            total_tip,
            total_bonus,
            total_penalty,
            total_adjustment,
            total_tax_deducted,
            total_withdrawn,
            total_pending,
            gross_income,
            min_deposit: minDeposit,
            net_balance,
            available_balance,
            effective_balance,
            bonus_wallet_total: total_bonus,
            bonus_wallet_enabled: enableBonus,
            // Tiền của các tua chưa có đánh giá — CHƯA cộng vào số dư.
            // Hiện riêng để KTV biết còn bao nhiêu đang chờ khách chấm sao.
            pending_review_amount: provisionalTotals.take_home,
            pending_review_turns: provisionalTotals.turns
        };
    }


}
