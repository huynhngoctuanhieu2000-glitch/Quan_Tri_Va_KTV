'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { format, subDays } from 'date-fns';

// 🔧 CONFIG
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const getTodayVn = () => {
  const d = new Date(Date.now() + VN_OFFSET_MS);
  return d.toISOString().split('T')[0];
};

export interface HistoryRecord {
  id: string;
  billCode: string;
  createdAt: string;
  status: string;
  rating: number | null;
  tip: number;
  commission: number;
  serviceName: string;
  duration: number;
  bonusPoints: number;
}

export type DatePreset = 'today' | 'yesterday' | '7days' | 'custom';

export const useKTVHistory = () => {
  const { hasPermission, user } = useAuth();

  const today = getTodayVn();
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo]   = useState(today);

  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState({ totalCommission: 0, totalTip: 0, totalOrders: 0, totalBonus: 0 });

  const fetchHistory = useCallback(async (from: string, to: string) => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/ktv/history?techCode=${user.id}&dateFrom=${from}&dateTo=${to}`);
      const json = await res.json();
      if (json.success) {
        setHistory(json.data);
        const totalCommission = (json.data as HistoryRecord[]).reduce((s, r) => s + (r.commission || 0), 0);
        const totalTip        = (json.data as HistoryRecord[]).reduce((s, r) => s + (r.tip || 0), 0);
        const totalBonus      = (json.data as HistoryRecord[]).reduce((s, r) => s + (r.bonusPoints || 0), 0);
        setSummary({ totalCommission, totalTip, totalOrders: json.data.length, totalBonus });
      }
    } catch (err) {
      console.error('[KTVHistory]', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Apply preset — re-run when user.id becomes available (after F5)
  useEffect(() => {
    if (!user?.id) return; // wait until auth is ready
    const t = getTodayVn();
    if (datePreset === 'today') {
      setDateFrom(t); setDateTo(t);
      fetchHistory(t, t);
    } else if (datePreset === 'yesterday') {
      const y = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      setDateFrom(y); setDateTo(y);
      fetchHistory(y, y);
    } else if (datePreset === '7days') {
      const w = format(subDays(new Date(), 6), 'yyyy-MM-dd');
      setDateFrom(w); setDateTo(t);
      fetchHistory(w, t);
    }
    // 'custom' → user picks manually
  }, [datePreset, user?.id]); // eslint-disable-line

  const applyCustomDate = () => fetchHistory(dateFrom, dateTo);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS': return { label: 'Đang làm',       color: 'text-indigo-600 bg-indigo-50' };
      case 'FEEDBACK':    return { label: 'Chờ đánh giá',   color: 'text-blue-600 bg-blue-50' };
      case 'DONE':        return { label: 'Hoàn tất',       color: 'text-emerald-600 bg-emerald-50' };
      case 'COMPLETED':   return { label: 'Hoàn tất',       color: 'text-emerald-600 bg-emerald-50' };
      case 'CANCELLED':   return { label: 'Đã huỷ',         color: 'text-red-500 bg-red-50' };
      default:            return { label: status,            color: 'text-gray-500 bg-gray-50' };
    }
  };

  return {
    user, hasPermission,
    history, isLoading,
    datePreset, setDatePreset,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    applyCustomDate,
    summary,
    getStatusLabel,
    refetch: () => fetchHistory(dateFrom, dateTo),
  };
};
