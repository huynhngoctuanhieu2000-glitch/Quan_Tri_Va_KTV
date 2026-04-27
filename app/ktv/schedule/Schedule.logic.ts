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

export interface ShiftRecord {
    id: string;
    employeeId: string;
    employeeName: string;
    shiftType: string;
    effectiveFrom: string;
    previousShift: string | null;
    reason: string | null;
    status: 'ACTIVE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REPLACED';
    reviewedBy: string | null;
    reviewedAt: string | null;
    createdAt: string;
}

export interface ShiftTypes {
    [key: string]: { label: string; start: string; end: string };
}

export type ScheduleTab = 'off' | 'shift';

/**
 * Custom hook for KTV Schedule page logic.
 * Combines leave (OFF) and shift management.
 */
export const useKTVSchedule = () => {
    const { hasPermission, user } = useAuth();

    // Tab state
    const [activeTab, setActiveTab] = useState<ScheduleTab>('off');

    // Common
    const [mounted, setMounted] = useState(false);
    const canAccessPage = hasPermission('ktv_schedule');

    // ── OFF state ──
    const [reason, setReason] = useState('');
    const [dates, setDates] = useState<string[]>(['']);
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
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    // ── Shift state ──
    const [currentShift, setCurrentShift] = useState<ShiftRecord | null>(null);
    const [pendingRequest, setPendingRequest] = useState<ShiftRecord | null>(null);
    const [shiftHistory, setShiftHistory] = useState<ShiftRecord[]>([]);
    const [shiftTypes, setShiftTypes] = useState<ShiftTypes>({});
    const [isLoadingShift, setIsLoadingShift] = useState(true);
    const [newShiftType, setNewShiftType] = useState('');
    const [shiftReason, setShiftReason] = useState('');
    const [isSubmittingShift, setIsSubmittingShift] = useState(false);
    const [shiftError, setShiftError] = useState<string | null>(null);
    const [shiftSuccess, setShiftSuccess] = useState(false);

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

    // ── Fetch shift data ──
    const fetchShiftData = useCallback(async () => {
        if (!user?.id) return;
        setIsLoadingShift(true);
        try {
            const res = await fetch(`/api/ktv/shift?employeeId=${user.id}`);
            const result = await res.json();

            if (result.success) {
                setCurrentShift(result.data.currentShift);
                setPendingRequest(result.data.pendingRequest);
                setShiftHistory(result.data.history || []);
                setShiftTypes(result.shiftTypes || {});
            } else {
                console.error('❌ [Schedule] Fetch shift error:', result.error);
            }
        } catch (err) {
            console.error('❌ [Schedule] Fetch shift failed:', err);
        } finally {
            setIsLoadingShift(false);
        }
    }, [user?.id]);

    useEffect(() => {
        if (mounted && canAccessPage) {
            fetchLeaveList();
            fetchShiftData();
        }
    }, [mounted, canAccessPage, fetchLeaveList, fetchShiftData]);

    // ── Submit OFF request ──
    const handleSubmitOff = async (e: React.FormEvent) => {
        e.preventDefault();
        const validDates = dates.filter(d => d.trim() !== '');
        if (validDates.length === 0 || !reason || !user?.id) return;

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
                    dates: validDates,
                    reason,
                }),
            });

            const result = await res.json();

            if (!result.success) {
                setOffError(result.error || 'Lỗi gửi yêu cầu');
                return;
            }

            setOffSuccess(true);
            setReason('');
            setDates(['']);
            fetchLeaveList();
            setTimeout(() => setOffSuccess(false), 3000);
        } catch (err: any) {
            setOffError(err.message || 'Lỗi không xác định');
        } finally {
            setIsSubmittingOff(false);
        }
    };

    // ── Submit shift change request ──
    const handleSubmitShift = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newShiftType || !user?.id) return;

        setIsSubmittingShift(true);
        setShiftError(null);
        setShiftSuccess(false);

        try {
            const res = await fetch('/api/ktv/shift', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: user.id,
                    employeeName: user.name || user.id,
                    shiftType: newShiftType,
                    reason: shiftReason,
                }),
            });

            const result = await res.json();

            if (!result.success) {
                setShiftError(result.error || 'Lỗi gửi yêu cầu');
                return;
            }

            setShiftSuccess(true);
            setNewShiftType('');
            setShiftReason('');
            fetchShiftData();
            setTimeout(() => setShiftSuccess(false), 3000);
        } catch (err: any) {
            setShiftError(err.message || 'Lỗi không xác định');
        } finally {
            setIsSubmittingShift(false);
        }
    };

    return {
        // Common
        mounted,
        canAccessPage,
        activeTab,
        setActiveTab,

        // OFF
        reason,
        dates,
        isSubmittingOff,
        leaveList,
        isLoadingLeaves,
        offError,
        offSuccess,
        setOffSuccess,
        setReason,
        setDates,
        setOffError,
        handleSubmitOff,

        // Calendar
        calendarMonth,
        selectedDate,
        setSelectedDate,
        goToPrevMonth,
        goToNextMonth,
        goToToday,
        WEEKDAY_LABELS,

        // Shift
        currentShift,
        pendingRequest,
        shiftHistory,
        shiftTypes,
        isLoadingShift,
        newShiftType,
        shiftReason,
        isSubmittingShift,
        shiftError,
        shiftSuccess,
        setNewShiftType,
        setShiftReason,
        setShiftError,
        handleSubmitShift,
    };
};
