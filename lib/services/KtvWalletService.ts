import { SupabaseClient } from '@supabase/supabase-js';
import { KtvCommissionService } from './KtvCommissionService';
import { KtvTypeDCommissionService } from './KtvTypeDCommissionService';
import { KtvTypeDBonusService } from './KtvTypeDBonusService';

export class KtvWalletService {
    
    static applySnapshotFilter(query: any, workType: string) {
        if (workType === 'TYPE_D') return query.eq('work_type_snapshot', 'TYPE_D');
        return query.or(`work_type_snapshot.eq.${workType},work_type_snapshot.is.null`);
    }

    static async getWorkTypeSnapshot(supabase: SupabaseClient, staffId: string): Promise<string> {
        const { data } = await supabase.from('Staff').select('work_type').eq('id', staffId).single();
        return data?.work_type || 'TYPE_A';
    }

    static async getBalance(supabase: SupabaseClient, staffId: string) {
        const GLOBAL_START_DATE_STR = '2026-05-04';
        const GLOBAL_START_DATE_ISO = '2026-05-04T00:00:00.000Z';
        const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
        
        // 1. Get staff info (work_type)
        const { data: staffData } = await supabase.from('Staff').select('work_type').eq('id', staffId).single();
        const workType = staffData?.work_type || 'TYPE_A';

        if (workType === 'TYPE_D') {
            return await KtvWalletService.getTypeDBalance(supabase, staffId);
        }

        // 2. Fetch configs
        const commConfigs = await KtvCommissionService.getAllConfigs(supabase);
        const commConfig = commConfigs[workType] || commConfigs['TYPE_A'];
        const bonusConfig = await KtvCommissionService.getBonusConfig(supabase);

        const nowVnDate = new Date(Date.now() + VN_OFFSET_MS);
        const todayStr = nowVnDate.toISOString().split('T')[0];

        // 3. Fetch Ledger
        const { data: ledgers } = await supabase
            .from('KTVDailyLedger')
            .select('date, total_commission, total_tip, total_bonus, total_penalty')
            .eq('staff_id', staffId)
            .gte('date', GLOBAL_START_DATE_STR);

        let realtimeStartStr = `${GLOBAL_START_DATE_STR}T00:00:00+07:00`;
        const ledgerSummary = { comm: 0, tip: 0, bonus: 0, penalty: 0 };

        if (ledgers && ledgers.length > 0) {
            const pastLedgers = ledgers.filter(l => l.date < todayStr);
            if (pastLedgers.length > 0) {
                let maxDateStr = pastLedgers[0].date;
                pastLedgers.forEach(l => {
                    if (l.date > maxDateStr) maxDateStr = l.date;
                    ledgerSummary.comm += Number(l.total_commission);
                    ledgerSummary.tip += Number(l.total_tip);
                    ledgerSummary.bonus += Number(l.total_bonus || 0);
                    ledgerSummary.penalty += Number(l.total_penalty || 0);
                });

                const lastDateMs = new Date(`${maxDateStr}T00:00:00+07:00`).getTime();
                const nextDateVn = new Date(lastDateMs + 24 * 60 * 60 * 1000 + VN_OFFSET_MS);
                const nextDateStr = nextDateVn.toISOString().split('T')[0];
                realtimeStartStr = `${nextDateStr}T00:00:00+07:00`;
            }
        }

        // 4. Fetch Bookings
        let allBookings: any[] = [];
        let page = 0;
        const pageSize = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('Bookings')
                .select(`
                    id, timeStart, status, billCode, createdAt, rating,
                    BookingItems:BookingItems!fk_bookingitems_booking ( id, serviceId, technicianCodes, segments, status, tip, itemRating, ktvRatings, options, handover_status, handover_comment )
                `)
                .gte('timeStart', realtimeStartStr)
                // Lấy TẤT CẢ trạng thái của Booking (để tính tiền ngay cả khi Booking IN_PROGRESS)
                .range(page * pageSize, (page + 1) * pageSize - 1);
                
            if (error || !data || data.length === 0) break;
            allBookings = allBookings.concat(data);
            page++;
        }

        const { data: shiftsData } = await supabase
            .from('KTVShifts')
            .select('employeeId, shiftType, effectiveFrom')
            .eq('employeeId', staffId)
            .lte('effectiveFrom', todayStr)
            .in('status', ['ACTIVE', 'REPLACED'])
            .order('effectiveFrom', { ascending: true })
            .order('createdAt', { ascending: true });

        const { data: services } = await supabase.from('Services').select('id, duration, is_utility');
        const svcDurationMap: Record<string, number> = {};
        const svcUtilityMap: Record<string, boolean> = {};
        (services || []).forEach(s => { svcDurationMap[String(s.id)] = s.duration || 0; svcUtilityMap[String(s.id)] = !!s.is_utility; });

        let rt_commission = 0;
        let rt_tip = 0;
        let rt_bonus = 0;

        for (const b of allBookings) {
            const relevantItemsOriginal = (b.BookingItems || []).filter((i: any) =>
                i.technicianCodes && Array.isArray(i.technicianCodes) &&
                i.technicianCodes.some((tc: string) => tc.toLowerCase().includes(staffId.toLowerCase())) &&
                ['DONE', 'COMPLETED', 'CLEANING', 'FEEDBACK'].includes(i.status) // Chỉ tính tiền cho các Item đã xong
            );

            let relevantItems = relevantItemsOriginal.filter((i: any) => !svcUtilityMap[String(i.serviceId)]);
            if (relevantItems.length === 0 && relevantItemsOriginal.length > 0) {
                relevantItems = relevantItemsOriginal;
            }

            if (relevantItems.length === 0) continue;

            let bookingCommission = 0;
            let bookingTip = 0;
            let passedItemCount = 0;

            for (const item of relevantItems) {
                const { isPassed } = KtvCommissionService.checkIsItemPassed(item, b, staffId);
                if (isPassed) {
                    passedItemCount++;
                    const fallbackDuration = svcDurationMap[String(item.serviceId)] || 0;
                    let itemDuration = KtvCommissionService.calculateItemDuration(item, staffId, fallbackDuration);
                    if (itemDuration <= 0) itemDuration = 60;
                    bookingCommission += KtvCommissionService.calcCommission(itemDuration, commConfigs, workType, item.serviceId);
                    bookingTip += (Number(item.tip) || 0);
                }
            }

            if (bookingCommission === 0 && passedItemCount > 0) {
                bookingCommission = KtvCommissionService.calcCommission(60, commConfigs, workType, '');
            }


            rt_commission += bookingCommission;
            rt_tip += bookingTip;

            // Only add bonus if at least one item passed
            if (passedItemCount > 0) {
                rt_bonus += KtvCommissionService.calculateBookingBonus(b, staffId, todayStr, shiftsData || [], bonusConfig);
            }
        }

        // 5. Adjustments & Withdrawals
        const { data: adjustments } = await supabase
            .from('WalletAdjustments')
            .select('amount')
            .eq('staff_id', staffId)
            .gte('created_at', GLOBAL_START_DATE_ISO);
        const total_adjustment = (adjustments || []).reduce((sum, a) => sum + Number(a.amount), 0);

        const { data: withdrawals } = await supabase
            .from('KTVWithdrawals')
            .select('amount, status, note')
            .eq('staff_id', staffId)
            .or('wallet_type.eq.TUA,wallet_type.is.null')
            .gte('request_date', GLOBAL_START_DATE_ISO);
            
        const total_withdrawn = (withdrawals || [])
            .filter(w => w.status === 'APPROVED' && !(Math.abs(Number(w.amount)) === 1 && w.note?.includes('Báo trước')))
            .reduce((sum, w) => sum + Math.abs(Number(w.amount)), 0);
            
        const total_pending = (withdrawals || [])
            .filter(w => w.status === 'PENDING' && !(Math.abs(Number(w.amount)) === 1 && w.note?.includes('Báo trước')))
            .reduce((sum, w) => sum + Math.abs(Number(w.amount)), 0);

        const total_commission = ledgerSummary.comm + rt_commission;
        const total_tip = ledgerSummary.tip + rt_tip;
        const total_bonus = ledgerSummary.bonus + rt_bonus;
        const total_penalty = 0; 

        const gross_income = total_commission + total_adjustment;
        const net_balance = gross_income - total_withdrawn - total_pending;
        const available_balance = Math.max(0, net_balance - commConfig.minDeposit);
        const effective_balance = Math.max(0, net_balance);

        return {
            total_commission,
            total_tip,
            total_bonus,
            total_penalty,
            total_adjustment,
            total_withdrawn,
            total_pending,
            gross_income,
            min_deposit: commConfig.minDeposit,
            net_balance,
            available_balance,
            effective_balance,
            bonus_wallet_total: total_bonus,
            bonus_wallet_enabled: commConfig.isBonusWalletEnabled
        };
    }
    static async getTypeDBalance(supabase: SupabaseClient, staffId: string) {
        const GLOBAL_START_DATE_STR = '2026-05-04';
        const GLOBAL_START_DATE_ISO = '2026-05-04T00:00:00.000Z';
        const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
        
        const { data: configsData } = await supabase.from('SystemConfigs').select('key, value').ilike('key', '%type_d%');
        const configs: Record<string, any> = {};
        (configsData || []).forEach((c: any) => { configs[c.key] = c.value; });

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
                    ledgerSummary.comm += Number(l.total_commission);
                    ledgerSummary.tip += Number(l.total_tip);
                    ledgerSummary.bonus += Number(l.total_bonus || 0);
                    ledgerSummary.penalty += Number(l.total_penalty || 0);
                });

                const lastDateMs = new Date(`${maxDateStr}T00:00:00+07:00`).getTime();
                const nextDateVn = new Date(lastDateMs + 24 * 60 * 60 * 1000 + VN_OFFSET_MS);
                const nextDateStr = nextDateVn.toISOString().split('T')[0];
                realtimeStartStr = `${nextDateStr}T00:00:00+07:00`;
            }
        }

        let allBookings: any[] = [];
        let page = 0;
        const pageSize = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('Bookings')
                .select(`
                    id, timeStart, status, billCode, createdAt, rating,
                    BookingItems:BookingItems!fk_bookingitems_booking ( id, serviceId, technicianCodes, segments, status, tip, itemRating, ktvRatings, options, handover_status, handover_comment )
                `)
                .gte('timeStart', realtimeStartStr)
                .range(page * pageSize, (page + 1) * pageSize - 1);
                
            if (error || !data || data.length === 0) break;
            allBookings = allBookings.concat(data);
            page++;
        }

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

        let rt_commission = 0;
        let rt_tip = 0;
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

            const vipItems = relevantItems.filter((i: any) => {
                const svcId = String(i.serviceId).toUpperCase();
                return svcId.startsWith('NHP') || svcId.startsWith('NHT') || svcId.startsWith('VIP');
            });
            const ptItems = relevantItems.filter((i: any) => {
                const svcId = String(i.serviceId).toUpperCase();
                return !(svcId.startsWith('NHP') || svcId.startsWith('NHT') || svcId.startsWith('VIP'));
            });

            const vipCommission = KtvTypeDCommissionService.calculateGuestCommission(vipItems, staffId, b.rating, rateVIP, ratingDeductions);
            const ptCommission = KtvTypeDCommissionService.calculateGuestCommission(ptItems, staffId, b.rating, ratePT, ratingDeductions);

            rt_commission += vipCommission + ptCommission;

            let bookingTip = 0;
            relevantItems.forEach((i: any) => bookingTip += (Number(i.tip) || 0));
            rt_tip += bookingTip;

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

        const { data: adjustments } = await supabase
            .from('WalletAdjustments')
            .select('amount')
            .eq('staff_id', staffId)
            .eq('work_type_snapshot', 'TYPE_D')
            .gte('created_at', GLOBAL_START_DATE_ISO);
        const total_adjustment = (adjustments || []).reduce((sum: number, a: any) => sum + Number(a.amount), 0);

        const { data: withdrawals } = await supabase
            .from('KTVWithdrawals')
            .select('amount, status, note')
            .eq('staff_id', staffId)
            .eq('work_type_snapshot', 'TYPE_D')
            .gte('request_date', GLOBAL_START_DATE_ISO);
            
        const total_withdrawn = (withdrawals || [])
            .filter((w: any) => w.status === 'APPROVED' && !(Math.abs(Number(w.amount)) === 1 && w.note?.includes('Bảo trì')))
            .reduce((sum: number, w: any) => sum + Math.abs(Number(w.amount)), 0);
            
        const total_pending = (withdrawals || [])
            .filter((w: any) => w.status === 'PENDING' && !(Math.abs(Number(w.amount)) === 1 && w.note?.includes('Bảo trì')))
            .reduce((sum: number, w: any) => sum + Math.abs(Number(w.amount)), 0);

        const total_commission = ledgerSummary.comm + rt_commission;
        const total_tip = ledgerSummary.tip + rt_tip;
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
            total_withdrawn,
            total_pending,
            gross_income,
            min_deposit: minDeposit,
            net_balance,
            available_balance,
            effective_balance,
            bonus_wallet_total: total_bonus,
            bonus_wallet_enabled: enableBonus
        };
    }

}
