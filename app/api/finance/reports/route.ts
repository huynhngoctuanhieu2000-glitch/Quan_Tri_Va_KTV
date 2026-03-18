import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// 🔧 CONFIG
const COMPLETED_STATUSES = ['COMPLETED', 'DONE', 'FEEDBACK'];
const OPERATING_HOURS_PER_DAY = 12; // Spa mở cửa 12h/ngày

/**
 * GET /api/finance/reports?dateFrom=2026-03-01&dateTo=2026-03-31
 * Returns comprehensive revenue & reports data
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
        return NextResponse.json({ success: false, error: 'dateFrom and dateTo are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
    }

    try {
        // ─── 1. Fetch completed bookings in date range ───────────────────
        const { data: bookings, error: bErr } = await supabase
            .from('Bookings')
            .select('id, billCode, bookingDate, createdAt, status, totalAmount, tip, technicianCode, customerId')
            .in('status', COMPLETED_STATUSES)
            .gte('bookingDate', `${dateFrom} 00:00:00`)
            .lte('bookingDate', `${dateTo} 23:59:59`)
            .order('bookingDate', { ascending: true });

        if (bErr) throw bErr;
        const completedBookings = bookings || [];

        // ─── 2. Fetch BookingItems for these bookings ────────────────────
        const bookingIds = completedBookings.map(b => b.id);
        let items: any[] = [];
        if (bookingIds.length > 0) {
            // Supabase limit 100 items per IN clause, batch if needed
            const batchSize = 50;
            for (let i = 0; i < bookingIds.length; i += batchSize) {
                const batch = bookingIds.slice(i, i + batchSize);
                const { data: batchItems } = await supabase
                    .from('BookingItems')
                    .select('id, bookingId, serviceId, price, tip, itemRating, technicianCodes, roomName, quantity')
                    .in('bookingId', batch);
                if (batchItems) items.push(...batchItems);
            }
        }

        // ─── 3. Fetch Services for names ─────────────────────────────────
        const serviceIds = [...new Set(items.map(i => i.serviceId).filter(Boolean))];
        const svcMap: Record<string, string> = {};
        if (serviceIds.length > 0) {
            const { data: svcs } = await supabase
                .from('Services')
                .select('id, code, nameVN')
                .in('id', serviceIds);
            (svcs || []).forEach((s: any) => {
                if (s.id) svcMap[String(s.id)] = s.nameVN || s.code || String(s.id);
                if (s.code) svcMap[String(s.code)] = s.nameVN || s.code;
            });
            // Fallback by code
            const unresolvedIds = serviceIds.filter(sid => !svcMap[String(sid)]);
            if (unresolvedIds.length > 0) {
                const { data: svcsByCode } = await supabase
                    .from('Services')
                    .select('id, code, nameVN')
                    .in('code', unresolvedIds);
                (svcsByCode || []).forEach((s: any) => {
                    if (s.id) svcMap[String(s.id)] = s.nameVN || s.code;
                    if (s.code) svcMap[String(s.code)] = s.nameVN || s.code;
                });
            }
        }

        // ─── 4. Fetch new customers in date range ────────────────────────
        const { count: newCustomerCount } = await supabase
            .from('Customers')
            .select('id', { count: 'exact', head: true })
            .gte('createdAt', `${dateFrom}T00:00:00`)
            .lte('createdAt', `${dateTo}T23:59:59`);

        // ─── 5. Fetch Beds count for occupancy calculation ───────────────
        const { count: totalBeds } = await supabase
            .from('Beds')
            .select('id', { count: 'exact', head: true });

        // ─── 6. Calculate previous period for comparison ─────────────────
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        const periodDays = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        
        const prevTo = new Date(fromDate);
        prevTo.setDate(prevTo.getDate() - 1);
        const prevFrom = new Date(prevTo);
        prevFrom.setDate(prevFrom.getDate() - periodDays + 1);
        
        const prevFromStr = prevFrom.toISOString().split('T')[0];
        const prevToStr = prevTo.toISOString().split('T')[0];

        const { data: prevBookings } = await supabase
            .from('Bookings')
            .select('id, totalAmount, customerId')
            .in('status', COMPLETED_STATUSES)
            .gte('bookingDate', `${prevFromStr} 00:00:00`)
            .lte('bookingDate', `${prevToStr} 23:59:59`);

        const { count: prevNewCustomers } = await supabase
            .from('Customers')
            .select('id', { count: 'exact', head: true })
            .gte('createdAt', `${prevFromStr}T00:00:00`)
            .lte('createdAt', `${prevToStr}T23:59:59`);

        // ─── 7. Calculate Summaries ──────────────────────────────────────
        const revenue = completedBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
        const orders = completedBookings.length;
        const avgPerOrder = orders > 0 ? Math.round(revenue / orders) : 0;
        const totalTip = items.reduce((sum, i) => sum + (Number(i.tip) || 0), 0);

        // Average rating
        const ratedItems = items.filter(i => i.itemRating && Number(i.itemRating) > 0);
        const avgRating = ratedItems.length > 0
            ? Math.round((ratedItems.reduce((sum, i) => sum + Number(i.itemRating), 0) / ratedItems.length) * 10) / 10
            : 0;

        // Occupancy: total service hours / (beds × operating hours × days)
        const totalServiceMins = items.reduce((sum, i) => sum + (Number(i.quantity) || 1) * 60, 0); // Fallback 60 min
        const maxCapacityMins = (totalBeds || 1) * OPERATING_HOURS_PER_DAY * 60 * periodDays;
        const occupancy = Math.min(100, Math.round((totalServiceMins / maxCapacityMins) * 100));

        // Previous period
        const prevRevenue = (prevBookings || []).reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
        const prevOrders = (prevBookings || []).length;

        const revenueChange = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 1000) / 10 : 0;
        const ordersChange = prevOrders > 0 ? Math.round(((orders - prevOrders) / prevOrders) * 1000) / 10 : 0;
        const customersChange = (prevNewCustomers || 0) > 0
            ? Math.round((((newCustomerCount || 0) - (prevNewCustomers || 0)) / (prevNewCustomers || 1)) * 1000) / 10
            : 0;

        // ─── 8. Daily Revenue ────────────────────────────────────────────
        const dailyMap: Record<string, { date: string; revenue: number; orders: number }> = {};
        completedBookings.forEach(b => {
            const day = (b.bookingDate || b.createdAt || '').split(' ')[0].split('T')[0];
            if (!day) return;
            if (!dailyMap[day]) dailyMap[day] = { date: day, revenue: 0, orders: 0 };
            dailyMap[day].revenue += Number(b.totalAmount) || 0;
            dailyMap[day].orders += 1;
        });
        const dailyRevenue = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

        // ─── 9. Service Breakdown ────────────────────────────────────────
        const svcBreakdown: Record<string, { name: string; revenue: number; count: number }> = {};
        items.forEach(i => {
            const key = String(i.serviceId || 'unknown');
            const name = svcMap[key] || key.toUpperCase();
            if (!svcBreakdown[key]) svcBreakdown[key] = { name, revenue: 0, count: 0 };
            svcBreakdown[key].revenue += Number(i.price) || 0;
            svcBreakdown[key].count += 1;
        });
        const serviceBreakdown = Object.values(svcBreakdown)
            .sort((a, b) => b.revenue - a.revenue);

        // ─── 10. Top KTV ─────────────────────────────────────────────────
        const ktvMap: Record<string, { code: string; orders: number; revenue: number }> = {};
        completedBookings.forEach(b => {
            if (!b.technicianCode) return;
            const codes = b.technicianCode.split(',').map((c: string) => c.trim()).filter(Boolean);
            const share = codes.length > 0 ? (Number(b.totalAmount) || 0) / codes.length : 0;
            codes.forEach((code: string) => {
                if (!ktvMap[code]) ktvMap[code] = { code, orders: 0, revenue: 0 };
                ktvMap[code].orders += 1;
                ktvMap[code].revenue += share;
            });
        });
        const topKTV = Object.values(ktvMap)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        // ─── 11. Peak Hours ──────────────────────────────────────────────
        const hourMap: Record<number, number> = {};
        completedBookings.forEach(b => {
            const time = b.createdAt || b.bookingDate || '';
            const match = time.match(/(\d{2}):\d{2}/);
            if (match) {
                const hour = parseInt(match[1], 10);
                hourMap[hour] = (hourMap[hour] || 0) + 1;
            }
        });
        const peakHours = Array.from({ length: 24 }, (_, h) => ({
            hour: `${h}:00`,
            count: hourMap[h] || 0,
        })).filter(h => h.count > 0 || (parseInt(h.hour) >= 8 && parseInt(h.hour) <= 22));

        // ─── 12. Employees lookup for KTV names ──────────────────────────
        const ktvCodes = topKTV.map(k => k.code);
        let employeeMap: Record<string, string> = {};
        if (ktvCodes.length > 0) {
            const { data: employees } = await supabase
                .from('Employees')
                .select('code, name')
                .in('code', ktvCodes);
            (employees || []).forEach((e: any) => {
                if (e.code) employeeMap[e.code] = e.name || e.code;
            });
        }

        return NextResponse.json({
            success: true,
            summary: {
                revenue,
                orders,
                newCustomers: newCustomerCount || 0,
                avgRating,
                occupancy,
                avgPerOrder,
                totalTip,
                revenueChange,
                ordersChange,
                customersChange,
            },
            dailyRevenue,
            serviceBreakdown,
            topKTV: topKTV.map(k => ({ ...k, name: employeeMap[k.code] || k.code })),
            peakHours,
            _meta: { dateFrom, dateTo, prevFrom: prevFromStr, prevTo: prevToStr, periodDays },
        });

    } catch (err: any) {
        console.error('❌ [Finance Reports API]', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
