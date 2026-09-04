import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KtvTypeDCommissionService } from '@/lib/services/KtvTypeDCommissionService';
import { KtvTypeDBonusService } from '@/lib/services/KtvTypeDBonusService';
import { KtvTypeDTurnService } from '@/lib/services/KtvTypeDTurnService';
import { processMonthlyLedgerSync, processYearlyLedgerSync, processMonthlyMaintenanceFee } from '@/lib/services/KtvLedgerSyncService';
import { SyncDailyLedgerPostSchema } from '@/lib/schemas/finance.schema';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TYPE_D_RULE_EFFECTIVE_FROM = '2026-09-01';

async function processLedgerSyncTypeD(targetDateStr: string) {
    console.log(`[Cron Type D] Syncing Daily Ledger for date: ${targetDateStr}`);

    if (targetDateStr < TYPE_D_RULE_EFFECTIVE_FROM) {
        console.log(`[Cron Type D] Date ${targetDateStr} is before effective date ${TYPE_D_RULE_EFFECTIVE_FROM}. Skipping (Option B).`);
        return NextResponse.json({ success: true, message: 'Skipped - Before effective date' });
    }

    const startTimeStr = `${targetDateStr}T00:00:00+07:00`;
    const endTimeStr = `${targetDateStr}T23:59:59.999+07:00`;

    // 1. Fetch Configs for Type D
    const { data: configs } = await supabase.from('SystemConfigs').select('key, value');
    const sysConfigs: Record<string, any> = {};
    (configs || []).forEach(c => {
        let val = c.value;
        if (typeof val === 'string') {
            try { val = JSON.parse(val); } catch {}
        }
        sysConfigs[c.key] = val;
    });

    const basePoints_D = Number(sysConfigs['ktv_type_d_bonus_points']) || 20;
    const pointRate_D = Number(sysConfigs['ktv_bonus_rate_TYPE_D']) || 1000;
    // ⚠️ Key phải khớp CHÍNH XÁC với những gì Admin Settings ghi ra
    // (app/admin/settings/system/KtvTypeDSettingsBlock.tsx) và với các consumer khác
    // (history, wallet, timeline). Trước đây file này dùng '..._rate_60m' và
    // 'rating_deductions' (số nhiều) — không key nào tồn tại trong SystemConfigs, nên
    // cron luôn rơi về default và bỏ qua mọi thay đổi đơn giá của Admin.
    const rateVIP = Number(sysConfigs['ktv_type_d_vip_rate_per_60m']) || 180000;
    const ratePT = Number(sysConfigs['ktv_type_d_pt_rate_per_60m']) || 100000;

    let ratingDeductions: Record<string, number> = { '0': 0, '1': 0.75, '2': 0.5, '3': 0.25, '4': 0 };
    if (sysConfigs['ktv_type_d_rating_deduction']) {
        ratingDeductions = sysConfigs['ktv_type_d_rating_deduction'];
    }

    // 2. Fetch KTVs
    const { data: ktvs } = await supabase
        .from('Staff')
        .select('id, full_name, work_type, feature_flags')
        .eq('work_type', 'TYPE_D');
    
    if (!ktvs || ktvs.length === 0) return NextResponse.json({ success: true, message: 'No Type D KTVs found' });
    
    const staffBonusMap: Record<string, boolean> = {};
    const activeStaffIds = ktvs.map(k => {
        const canBonus = k.feature_flags?.enable_bonus ?? true;
        staffBonusMap[k.id.toLowerCase()] = canBonus;
        return k.id;
    });

    // 3. Fetch all Bookings for the day
    const { data: bookings } = await supabase
        .from('Bookings')
        .select('id, timeStart, status, customerId, rating, BookingItems!fk_bookingitems_booking(*)')
        .gte('timeStart', startTimeStr)
        .lte('timeStart', endTimeStr)
        .neq('status', 'CANCELLED');

    const validStatuses = ['DONE', 'COMPLETED', 'FEEDBACK', 'CLEANING'];

    // 3b. Fetch Services for utility check (hours_earned excludes utility services)
    const { data: servicesData } = await supabase.from('Services').select('id, is_utility');
    const utilityServiceIds = new Set<string>();
    (servicesData || []).forEach((s: any) => {
        if (s.is_utility) utilityServiceIds.add(String(s.id));
    });

    // 4. Fetch adjustments, withdrawals, and EXISTING LEDGER for conflict check
    const [{ data: adjustments }, { data: withdrawals }, { data: existingLedgers }] = await Promise.all([
        supabase.from('WalletAdjustments').select('amount, staff_id').eq('type', 'ADJUSTMENT').gte('created_at', startTimeStr).lte('created_at', endTimeStr),
        supabase.from('WalletAdjustments').select('amount, staff_id').eq('type', 'WITHDRAWAL').gte('created_at', startTimeStr).lte('created_at', endTimeStr),
        supabase.from('KTVDailyLedger').select('staff_id, work_type_snapshot').eq('date', targetDateStr).in('staff_id', activeStaffIds)
    ]);

    const existingLedgerMap: Record<string, string | null> = {};
    (existingLedgers || []).forEach(l => {
        existingLedgerMap[l.staff_id.toLowerCase()] = l.work_type_snapshot;
    });

    // 5. Calculate per KTV
    const upsertRows: any[] = [];
    const allServiceHoursRows: any[] = []; // Accumulates hours_earned across all KTVs
    
    const { data: allStaff } = await supabase.from('Staff').select('id, work_type');
    const allStaffWorkTypeMap: Record<string, string> = {};
    (allStaff || []).forEach(s => {
        allStaffWorkTypeMap[s.id.toLowerCase()] = s.work_type || 'TYPE_A';
    });

    for (const techId of activeStaffIds) {
        const techCode = techId.toLowerCase();
        
        // Conflict check
        const existingSnapshot = existingLedgerMap[techCode];
        if (existingSnapshot && existingSnapshot !== 'TYPE_D') {
            console.log(`[Cron Type D] KTV ${techId} has existing ledger with snapshot ${existingSnapshot}. Skipping to avoid overwrite.`);
            continue;
        }

        let total_commission = 0;
        let total_bonus = 0;
        let total_tip = 0;
        let commissionBreakdown: any[] = [];
        let lowestRating = 5;
        const serviceHoursRows: any[] = []; // Accumulate hours_earned per booking for KTVServiceHoursLedger

        for (const b of (bookings || [])) {
            const items = (b.BookingItems || []).filter((i: any) => 
                i.technicianCodes && i.technicianCodes.map((t: string) => t.toLowerCase()).includes(techCode)
                && validStatuses.includes(i.status)
            );
            if (items.length === 0) continue;

            // Rating logic
            const safeRating = b.rating ?? 0;
            if (safeRating < lowestRating) lowestRating = safeRating;

            // Separate items by category — VIP (NHP/NHT/VIP) vs Phổ thông (còn lại).
            // Không có nhóm COMBO: không mã dịch vụ nào bắt đầu bằng 'COMBO'
            // ("Combo King" thực tế là NHS0800 → thuộc nhóm Phổ thông), và Admin Settings
            // cũng chỉ cấu hình 2 đơn giá. Cách chia này khớp history/wallet/timeline.
            const vipItems = items.filter((i: any) => String(i.serviceId).toUpperCase().startsWith('NHP') || String(i.serviceId).toUpperCase().startsWith('NHT') || String(i.serviceId).toUpperCase().startsWith('VIP'));
            const ptItems = items.filter((i: any) => !vipItems.includes(i));

            const vipComm = KtvTypeDCommissionService.calculateGuestCommission(vipItems, techCode, safeRating, rateVIP, ratingDeductions);
            const ptComm = KtvTypeDCommissionService.calculateGuestCommission(ptItems, techCode, safeRating, ratePT, ratingDeductions);

            const bookingComm = vipComm + ptComm;
            total_commission += bookingComm;

            // Extract segments duration for breakdown
            let totalDur = 0;
            items.forEach((i: any) => {
                let segs = [];
                try { segs = typeof i.segments === 'string' ? JSON.parse(i.segments) : (i.segments || []); } catch {}
                segs.filter((s:any) => s.ktvId?.toLowerCase() === techCode).forEach((s:any) => {
                    totalDur += Number(s.duration) || 60;
                });
            });

            commissionBreakdown.push({
                bookingId: b.id,
                duration: totalDur,
                workType: 'TYPE_D',
                commission: bookingComm
            });

            // === SERVICE HOURS LEDGER: Calculate actual minutes (excludes utility) ===
            const nonUtilityItems = items.filter((i: any) => !utilityServiceIds.has(String(i.serviceId)));
            let bookingActualMins = 0;
            nonUtilityItems.forEach((item: any) => {
                const mins = KtvTypeDTurnService.calculateActualMinutes(item, techCode);
                if (mins > 0) bookingActualMins += mins;
            });
            if (bookingActualMins > 0) {
                serviceHoursRows.push({
                    staff_id: techId,
                    date: targetDateStr,
                    booking_id: b.id,
                    hours_earned: bookingActualMins / 60,
                    hours_penalty: 0
                });
            }

            // Tip
            let bookingTip = 0;
            items.forEach((i: any) => {
                if (i.tip && !isNaN(i.tip)) bookingTip += Number(i.tip);
            });
            total_tip += bookingTip;

            // Bonus
            if (staffBonusMap[techCode]) {
                const ktvWorkTypesForGuest: string[] = [];
                (b.BookingItems || []).forEach((i: any) => {
                    if (i.technicianCodes && Array.isArray(i.technicianCodes)) {
                        i.technicianCodes.forEach((tc: string) => {
                            ktvWorkTypesForGuest.push(allStaffWorkTypeMap[tc.toLowerCase()] || 'TYPE_A');
                        });
                    }
                });
                const typeDBonusVND = KtvTypeDBonusService.calculateBonusForTypeD(ktvWorkTypesForGuest, safeRating, basePoints_D, pointRate_D);
                total_bonus += (typeDBonusVND / pointRate_D); // Points
            }
        }

        const deductionStr = lowestRating.toString();
        const appliedDeduction = lowestRating === 5 ? 0 : (ratingDeductions[deductionStr] ?? 0);

        const techAdjustments = (adjustments || []).filter((a: any) => a.staff_id.toLowerCase() === techCode);
        const techWithdrawals = (withdrawals || []).filter((w: any) => w.staff_id.toLowerCase() === techCode);
        const total_adjustment = techAdjustments.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
        const total_withdrawn = techWithdrawals.reduce((sum: number, w: any) => sum + Number(w.amount), 0);

        upsertRows.push({
            date: targetDateStr,
            staff_id: techId, // Keep original case
            total_commission,
            total_tip,
            total_bonus,
            total_penalty: 0,
            total_adjustment,
            total_withdrawn,
            total_tax: 0,
            work_type_snapshot: 'TYPE_D',
            rating_deduction: appliedDeduction,
            commission_breakdown: commissionBreakdown,
            updated_at: new Date().toISOString()
        });
        allServiceHoursRows.push(...serviceHoursRows);
    }

    if (upsertRows.length > 0) {
        const { error: upsertErr } = await supabase.from('KTVDailyLedger').upsert(upsertRows, { onConflict: 'date, staff_id' });
        if (upsertErr) {
            console.error('[Cron Type D] Upsert Error:', upsertErr);
            throw upsertErr;
        }
    }

    // === Insert hours_earned into KTVServiceHoursLedger (idempotent via duplicate skip) ===
    // NOTE: Cannot use .upsert() because the unique constraint is a PARTIAL index
    // (WHERE booking_id IS NOT NULL). PostgreSQL rejects ON CONFLICT on partial indexes.
    // Instead, we INSERT each row individually and skip 23505 (duplicate) errors.
    if (allServiceHoursRows.length > 0) {
        let insertedCount = 0;
        for (const row of allServiceHoursRows) {
            const { error: shErr } = await supabase
                .from('KTVServiceHoursLedger')
                .insert(row);
            if (shErr) {
                if (shErr.code === '23505') continue; // Already synced, skip
                console.error(`[Cron Type D] ServiceHoursLedger Insert Error for ${row.staff_id}:`, shErr);
            } else {
                insertedCount++;
            }
        }
        console.log(`[Cron Type D] Synced ${insertedCount} new service hours entries for ${targetDateStr} (${allServiceHoursRows.length - insertedCount} skipped)`);
    }

    const d = new Date(targetDateStr);
    d.setDate(d.getDate() + 1);
    if (d.getDate() === 1) {
        const month = parseInt(targetDateStr.slice(5, 7), 10);
        const year = parseInt(targetDateStr.slice(0, 4), 10);
        await processMonthlyLedgerSync(supabase, month, year);
        await processMonthlyMaintenanceFee(supabase, month, year);
        if (month === 12) await processYearlyLedgerSync(supabase, year);
    }

    return NextResponse.json({ success: true, message: `Synced ${upsertRows.length} TYPE_D ledgers for ${targetDateStr}` });
}

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    try {
        const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
        const nowVn = new Date(Date.now() + VN_OFFSET_MS);
        nowVn.setDate(nowVn.getDate() - 1);
        const targetDateStr = nowVn.toISOString().split('T')[0];
        return await processLedgerSyncTypeD(targetDateStr);
    } catch (err: any) {
        console.error('Exception in GET sync-daily-ledger-type-d:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        let targetDateStr = '';
        try {
            const body = await request.json();
            const parseResult = SyncDailyLedgerPostSchema.safeParse(body);
            if (parseResult.success && parseResult.data.targetDate) {
                targetDateStr = parseResult.data.targetDate;
            }
        } catch { }
        if (!targetDateStr) {
            const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
            const nowVn = new Date(Date.now() + VN_OFFSET_MS);
            nowVn.setDate(nowVn.getDate() - 1);
            targetDateStr = nowVn.toISOString().split('T')[0];
        }
        return await processLedgerSyncTypeD(targetDateStr);
    } catch (err: any) {
        console.error('Exception in POST sync-daily-ledger-type-d:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
