'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const getTodayVn = () => {
    const d = new Date(Date.now() + VN_OFFSET_MS);
    return d.toISOString().split('T')[0];
};

export type DatePreset = 'today' | 'week' | 'month' | 'custom';

export interface ReportSummary {
    revenue: number;
    orders: number;
    newCustomers: number;
    avgRating: number;
    occupancy: number;
    avgPerOrder: number;
    totalTip: number;
    revenueChange: number;
    ordersChange: number;
    customersChange: number;
}

export interface DailyRevenue {
    date: string;
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
}

export interface PeakHour {
    hour: string;
    count: number;
}

export interface ReportData {
    summary: ReportSummary;
    dailyRevenue: DailyRevenue[];
    serviceBreakdown: ServiceBreakdown[];
    topKTV: TopKTV[];
    peakHours: PeakHour[];
}

const EMPTY_SUMMARY: ReportSummary = {
    revenue: 0, orders: 0, newCustomers: 0, avgRating: 0,
    occupancy: 0, avgPerOrder: 0, totalTip: 0,
    revenueChange: 0, ordersChange: 0, customersChange: 0,
};

export const useRevenueReport = () => {
    const today = getTodayVn();
    const [datePreset, setDatePreset] = useState<DatePreset>('month');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState<ReportData>({
        summary: EMPTY_SUMMARY,
        dailyRevenue: [],
        serviceBreakdown: [],
        topKTV: [],
        peakHours: [],
    });

    const fetchReport = useCallback(async (from: string, to: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/finance/reports?dateFrom=${from}&dateTo=${to}`);
            const json = await res.json();
            if (json.success) {
                setData({
                    summary: json.summary || EMPTY_SUMMARY,
                    dailyRevenue: json.dailyRevenue || [],
                    serviceBreakdown: json.serviceBreakdown || [],
                    topKTV: json.topKTV || [],
                    peakHours: json.peakHours || [],
                });
            }
        } catch (err) {
            console.error('[RevenueReport]', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

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
        } else {
            // custom — user picks manually
            return;
        }

        setDateFrom(from);
        setDateTo(to);
        fetchReport(from, to);
    }, [datePreset, fetchReport]);

    const applyCustomDate = () => fetchReport(dateFrom, dateTo);

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

    return {
        datePreset, setDatePreset,
        dateFrom, setDateFrom,
        dateTo, setDateTo,
        applyCustomDate,
        isLoading,
        data,
        formatVND,
        formatFullVND,
    };
};
