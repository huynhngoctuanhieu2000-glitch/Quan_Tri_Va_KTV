'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear } from 'date-fns';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const getTodayVn = () => {
    const d = new Date(Date.now() + VN_OFFSET_MS);
    return d.toISOString().split('T')[0];
};

export type DatePreset = 'today' | 'week' | 'month' | 'year' | 'custom';
export type GroupBy = 'hour' | 'day' | 'week' | 'month';

export interface ReportSummary {
    revenue: number;
    orders: number;
    newCustomers: number;
    avgRating: number;
    occupancy: number;
    avgPerOrder: number;
    totalTip: number;
    totalCommission: number;
    // New KPIs
    totalServiceCount: number;
    totalServiceRevenue: number;
    costPerService: number;
    costRatio: number;
    uniqueCustomers: number;
    avgBillPerCustomer: number;
    // Bed KPIs
    revenuePerBed: number;
    bedOccupancy: number;
    totalBeds: number;
    // Comparisons
    revenueChange: number;
    ordersChange: number;
    customersChange: number;
}

export interface DailyRevenue {
    date: string;
    revenue: number;
    orders: number;
}

export interface HourlyRevenue {
    hour: number;
    label: string;
    revenue: number;
    orders: number;
}

export interface WeeklyRevenue {
    week: string;
    revenue: number;
    orders: number;
}

export interface MonthlyRevenue {
    month: string;
    revenue: number;
    orders: number;
}

export interface ServiceBreakdown {
    name: string;
    revenue: number;
    count: number;
}

export interface TopKTV {
    code: string;
    name: string;
    orders: number;
    revenue: number;
    commission: number;
    totalTip: number;
    avgRating: number;
    ratingCount: number;
}

export interface PeakHour {
    hour: string;
    count: number;
}

export interface LanguageBreakdown {
    lang: string;
    revenue: number;
    orders: number;
}

export interface KTVOption {
    code: string;
    name: string;
}

export interface NewCustomer {
    id: string;
    name: string;
    phone: string;
    email: string;
    createdAt: string;
}

export interface ReportData {
    summary: ReportSummary;
    dailyRevenue: DailyRevenue[];
    hourlyRevenue: HourlyRevenue[];
    weeklyRevenue: WeeklyRevenue[];
    monthlyRevenue: MonthlyRevenue[];
    serviceBreakdown: ServiceBreakdown[];
    languageBreakdown: LanguageBreakdown[];
    topKTV: TopKTV[];
    peakHours: PeakHour[];
    serviceList: string[];
    ktvList: KTVOption[];
    newCustomerList: NewCustomer[];
}

const EMPTY_SUMMARY: ReportSummary = {
    revenue: 0, orders: 0, newCustomers: 0, avgRating: 0,
    occupancy: 0, avgPerOrder: 0, totalTip: 0, totalCommission: 0,
    totalServiceCount: 0, totalServiceRevenue: 0,
    costPerService: 0, costRatio: 0,
    uniqueCustomers: 0, avgBillPerCustomer: 0,
    revenuePerBed: 0, bedOccupancy: 0, totalBeds: 0,
    revenueChange: 0, ordersChange: 0, customersChange: 0,
};

export const useRevenueReport = () => {
    const today = getTodayVn();
    const [datePreset, setDatePreset] = useState<DatePreset>('month');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [groupBy, setGroupBy] = useState<GroupBy>('day');
    const [hourFrom, setHourFrom] = useState<number>(0);
    const [hourTo, setHourTo] = useState<number>(23);
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState<ReportData>({
        summary: EMPTY_SUMMARY,
        dailyRevenue: [],
        hourlyRevenue: [],
        weeklyRevenue: [],
        monthlyRevenue: [],
        serviceBreakdown: [],
        languageBreakdown: [],
        topKTV: [],
        peakHours: [],
        serviceList: [],
        ktvList: [],
        newCustomerList: [],
    });

    const fetchReport = useCallback(async (from: string, to: string, gb?: GroupBy, hFrom?: number, hTo?: number) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ dateFrom: from, dateTo: to, groupBy: gb || groupBy });
            // Only add hour filter when groupBy is 'hour'
            if ((gb || groupBy) === 'hour') {
                params.set('hourFrom', String(hFrom ?? hourFrom));
                params.set('hourTo', String(hTo ?? hourTo));
            }
            const res = await fetch(`/api/finance/reports?${params.toString()}`);
            const json = await res.json();
            if (json.success) {
                setData({
                    summary: json.summary || EMPTY_SUMMARY,
                    dailyRevenue: json.dailyRevenue || [],
                    hourlyRevenue: json.hourlyRevenue || [],
                    weeklyRevenue: json.weeklyRevenue || [],
                    monthlyRevenue: json.monthlyRevenue || [],
                    serviceBreakdown: json.serviceBreakdown || [],
                    languageBreakdown: json.languageBreakdown || [],
                    topKTV: json.topKTV || [],
                    peakHours: json.peakHours || [],
                    serviceList: json.serviceList || [],
                    ktvList: json.ktvList || [],
                    newCustomerList: json.newCustomerList || [],
                });
            }
        } catch (err) {
            console.error('[RevenueReport]', err);
        } finally {
            setIsLoading(false);
        }
    }, [groupBy, hourFrom, hourTo]);

    // Apply preset
    useEffect(() => {
        const t = getTodayVn();
        let from = t;
        let to = t;

        if (datePreset === 'today') {
            from = t;
            to = t;
        } else if (datePreset === 'week') {
            const now = new Date();
            from = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
            to = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        } else if (datePreset === 'month') {
            const now = new Date();
            from = format(startOfMonth(now), 'yyyy-MM-dd');
            to = format(endOfMonth(now), 'yyyy-MM-dd');
        } else if (datePreset === 'year') {
            const now = new Date();
            from = format(startOfYear(now), 'yyyy-MM-dd');
            to = format(endOfYear(now), 'yyyy-MM-dd');
        } else {
            // custom — user picks manually
            return;
        }

        setDateFrom(from);
        setDateTo(to);
        fetchReport(from, to);
    }, [datePreset, fetchReport]);

    const applyCustomDate = () => fetchReport(dateFrom, dateTo);

    // Re-fetch when groupBy or hour range changes (only if we already have dates)
    const applyGroupBy = (newGroupBy: GroupBy) => {
        setGroupBy(newGroupBy);
        if (dateFrom && dateTo) fetchReport(dateFrom, dateTo, newGroupBy);
    };

    const applyHourFilter = (newFrom: number, newTo: number) => {
        setHourFrom(newFrom);
        setHourTo(newTo);
        if (dateFrom && dateTo) fetchReport(dateFrom, dateTo, 'hour', newFrom, newTo);
    };

    // Format helpers
    const formatVND = (amount: number): string => {
        if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} tỷ`;
        if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} triệu`;
        if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
        return `${amount}đ`;
    };

    const formatFullVND = (amount: number): string => {
        return amount.toLocaleString('vi-VN') + 'đ';
    };

    const exportToCSV = () => {
        if (!data.summary) return;

        const BOM = '\uFEFF';
        let csv = 'DANH MỤC,CHỈ SỐ,GIÁ TRỊ\n';

        // 1. Tóm tắt KPI
        csv += `Tóm tắt,Tổng doanh thu,"${data.summary.revenue}"\n`;
        csv += `Tóm tắt,Số lượng dịch vụ,"${data.summary.totalServiceCount}"\n`;
        csv += `Tóm tắt,Tổng giá trị dịch vụ,"${data.summary.totalServiceRevenue}"\n`;
        csv += `Tóm tắt,Số khách hàng,"${data.summary.uniqueCustomers}"\n`;
        csv += `Tóm tắt,Tiền tua TB/Dịch vụ,"${data.summary.costPerService}"\n`;
        csv += `Tóm tắt,Tỷ lệ chi phí (%)","${data.summary.costRatio}"\n`;
        csv += `Tóm tắt,Điểm đánh giá TB,"${data.summary.avgRating}"\n`;
        csv += `Tóm tắt,Tổng tiền tip,"${data.summary.totalTip}"\n`;
        csv += `Tóm tắt,Tổng tiền tua,"${data.summary.totalCommission}"\n`;
        csv += `Tóm tắt,DT / Giường,"${data.summary.revenuePerBed}"\n`;
        csv += `Tóm tắt,Tỷ lệ lấp đầy giường (%),"${data.summary.bedOccupancy}"\n`;
        csv += `Tóm tắt,Tổng số giường,"${data.summary.totalBeds}"\n`;
        csv += '\n';

        // 2. Cơ cấu dịch vụ
        csv += 'CƠ CẤU DỊCH VỤ,Số lượng,Doanh thu\n';
        data.serviceBreakdown.forEach(s => {
            csv += `"${s.name}","${s.count}","${s.revenue}"\n`;
        });
        csv += '\n';

        // 3. Bảng xếp hạng KTV
        csv += 'BẢNG XẾP HẠNG KTV,Số đơn,Doanh thu,Tiền tua,Tiền tip,Rating\n';
        data.topKTV.forEach(k => {
            csv += `"${k.name}","${k.orders}","${k.revenue}","${k.commission}","${k.totalTip}","${k.avgRating}"\n`;
        });

        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Bao_Cao_Doanh_Thu_${dateFrom}_den_${dateTo}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return {
        datePreset, setDatePreset,
        dateFrom, setDateFrom,
        dateTo, setDateTo,
        groupBy, applyGroupBy,
        hourFrom, hourTo, applyHourFilter,
        applyCustomDate,
        isLoading,
        data,
        formatVND,
        formatFullVND,
        exportToCSV,
    };
};
