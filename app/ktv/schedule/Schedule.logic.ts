'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

// 🔧 UI CONFIGURATION
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// --- TYPES ---
export interface LeaveRequest {
    id: string;
    employeeId: string;
    employeeName: string;
    date: string;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
}

export const useKTVSchedule = () => {
    const { hasPermission, user } = useAuth();

    // Common
    const [mounted, setMounted] = useState(false);
    const canAccessPage = hasPermission('ktv_schedule');

    // ── OFF state ──
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [isSubmittingOff, setIsSubmittingOff] = useState(false);
    const [leaveList, setLeaveList] = useState<LeaveRequest[]>([]);
    const [isLoadingLeaves, setIsLoadingLeaves] = useState(true);
    const [offError, setOffError] = useState<string | null>(null);
    const [offSuccess, setOffSuccess] = useState(false);

    // ── Calendar state ──
    const [calendarMonth, setCalendarMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() }; // 0-indexed
    });

    useEffect(() => { setMounted(true); }, []);

    // ── Fetch leave schedule (by calendar month) ──
    const fetchLeaveList = useCallback(async () => {
        setIsLoadingLeaves(true);
        try {
            const { year, month } = calendarMonth;
            const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month + 1, 0).getDate();
            const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            const res = await fetch(`/api/ktv/leave?from=${from}&to=${to}`);
            const result = await res.json();

            if (result.success) {
                setLeaveList(result.data || []);
            } else {
                console.error('❌ [Schedule] Fetch leave error:', result.error);
            }
        } catch (err) {
            console.error('❌ [Schedule] Fetch leave failed:', err);
        } finally {
            setIsLoadingLeaves(false);
        }
    }, [calendarMonth]);

    // Calendar navigation
    const goToPrevMonth = useCallback(() => {
        setCalendarMonth(prev => {
            if (prev.month === 0) return { year: prev.year - 1, month: 11 };
            return { ...prev, month: prev.month - 1 };
        });
    }, []);

    const goToNextMonth = useCallback(() => {
        setCalendarMonth(prev => {
            if (prev.month === 11) return { year: prev.year + 1, month: 0 };
            return { ...prev, month: prev.month + 1 };
        });
    }, []);

    const goToToday = useCallback(() => {
        const now = new Date();
        setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
    }, []);

    useEffect(() => {
        if (mounted && canAccessPage) {
            fetchLeaveList();
        }
    }, [mounted, canAccessPage, fetchLeaveList]);

    const toggleDate = (date: string) => {
        setSelectedDates(prev => {
            if (prev.includes(date)) {
                return prev.filter(d => d !== date);
            } else {
                return [...prev, date];
            }
        });
    };

    // ── Submit OFF request ──
    const handleSubmitOff = async () => {
        if (selectedDates.length === 0 || !user?.id) return;

        setIsSubmittingOff(true);
        setOffError(null);
        setOffSuccess(false);

        try {
            const res = await fetch('/api/ktv/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: user.id,
                    employeeName: user.name || user.id,
                    dates: selectedDates,
                    reason: 'Xin nghỉ',
                }),
            });

            const result = await res.json();

            if (!result.success) {
                setOffError(result.error || 'Lỗi gửi yêu cầu');
                return;
            }

            setOffSuccess(true);
            setSelectedDates([]);
            fetchLeaveList();
            setTimeout(() => setOffSuccess(false), 3000);
        } catch (err: any) {
            setOffError(err.message || 'Lỗi không xác định');
        } finally {
            setIsSubmittingOff(false);
        }
    };

    return {
        mounted,
        canAccessPage,
        user,

        // OFF
        selectedDates,
        toggleDate,
        isSubmittingOff,
        leaveList,
        isLoadingLeaves,
        offError,
        offSuccess,
        setOffSuccess,
        setOffError,
        handleSubmitOff,

        // Calendar
        calendarMonth,
        goToPrevMonth,
        goToNextMonth,
        goToToday,
        WEEKDAY_LABELS,
    };
};
