'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// 🔧 CONFIGURATION
const GPS_TIMEOUT_MS = 10000;
const GPS_HIGH_ACCURACY = true;
// VN timezone offset
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Shift start and end times (must match API SHIFT_TYPES config)
const SHIFT_START_TIMES: Record<string, string> = {
    SHIFT_1: '09:00',
    SHIFT_2: '11:00',
    SHIFT_3: '17:00',
};
const SHIFT_END_TIMES: Record<string, string> = {
    SHIFT_1: '17:00',
    SHIFT_2: '19:00',
    SHIFT_3: '00:00', // treated as 24:00 of the same day
};

// --- TYPES ---
export type CheckStatus = 'IDLE' | 'LOADING_GPS' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CHECKED_OUT';

export interface AttendanceRecord {
    id: string;
    checkType: string;
    status: string;
    latitude: number | null;
    longitude: number | null;
    locationText: string | null;
    checkedAt: string;
}

/**
 * Custom hook for KTV Attendance page logic.
 * Handles GPS geolocation, check-in/check-out, and realtime status updates.
 */
export const useKTVAttendance = () => {
    const { hasPermission, user } = useAuth();
    const [checkStatus, setCheckStatus] = useState<CheckStatus>('IDLE');
    const [currentRecord, setCurrentRecord] = useState<AttendanceRecord | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    // Shift timing state
    const [activeShiftType, setActiveShiftType] = useState<string | null>(null);
    const [isLoadingShift, setIsLoadingShift] = useState(false);
    const [isLate, setIsLate] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // --- Fetch current attendance status on mount ---
    useEffect(() => {
        if (!user?.id) {
            setInitialLoading(false);
            return;
        }

        const fetchStatus = async () => {
            try {
                const res = await fetch(`/api/ktv/attendance/status?employeeId=${user.id}`);
                
                if (!res.ok) {
                    const text = await res.text();
                    console.error(`❌ [Attendance] Status API returned ${res.status}:`, text);
                    return;
                }

                const result = await res.json();

                if (result.success && result.checkStatus) {
                    setCheckStatus(result.checkStatus as CheckStatus);
                    if (result.record) {
                        setCurrentRecord(result.record);
                    }
                }
            } catch (err) {
                console.error('❌ [Attendance] Failed to fetch status:', err);
            } finally {
                setInitialLoading(false);
            }
        };

        fetchStatus();
    }, [user?.id]);

    // Fetch active shift when IDLE (for checkIsLate) or CONFIRMED (to validate checkout time)
    useEffect(() => {
        if (!['IDLE', 'CONFIRMED'].includes(checkStatus) || !user?.id) return;

        const fetchShift = async () => {
            setIsLoadingShift(true);
            try {
                const res = await fetch(`/api/ktv/shift?employeeId=${user.id}`);
                const result = await res.json();
                if (result.success && result.data?.currentShift) {
                    setActiveShiftType(result.data.currentShift.shiftType);
                } else {
                    setActiveShiftType(null); // no shift assigned → allow checkout
                }
            } catch {
                setActiveShiftType(null);
            } finally {
                setIsLoadingShift(false);
            }
        };

        fetchShift();
    }, [checkStatus, user?.id]);

    // --- Realtime subscription ---
    useEffect(() => {
        if (!user?.id || !currentRecord?.id) return;

        const channel = supabase
            .channel(`attendance_${currentRecord.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'KTVAttendance',
                filter: `id=eq.${currentRecord.id}`,
            }, (payload) => {
                const updated = payload.new as AttendanceRecord;
                setCurrentRecord(updated);

                if (updated.status === 'CONFIRMED') {
                    setCheckStatus(updated.checkType === 'CHECK_OUT' ? 'CHECKED_OUT' : 'CONFIRMED');
                } else if (updated.status === 'REJECTED') {
                    setCheckStatus('REJECTED');
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [user?.id, currentRecord?.id]);

    // --- GPS Removed ---
    // GPS is completely disabled in favor of IP Whitelisting

    // --- Handlers ---
    const checkIsLate = useCallback(() => {
        if (!activeShiftType) {
            setIsLate(false);
            return false;
        }

        const startTimeStr = SHIFT_START_TIMES[activeShiftType];
        if (!startTimeStr) {
            setIsLate(false);
            return false;
        }

        const vnNow = new Date(Date.now() + VN_OFFSET_MS);
        const [startHour, startMin] = startTimeStr.split(':').map(Number);
        
        // Tạo Date object đại diện cho giờ bắt đầu ca trong ngày hôm nay
        const vnStartStr = `${vnNow.toISOString().slice(0, 10)}T${startTimeStr}:00+07:00`;
        const startMs = new Date(vnStartStr).getTime();
        
        const nowMs = Date.now();
        const late = nowMs > startMs; // nếu giờ hiện tại lớn hơn giờ start ca
        
        setIsLate(late);
        return late;
    }, [activeShiftType]);

    const handleAttendance = useCallback(async (
        checkType: 'CHECK_IN' | 'CHECK_OUT' | 'LATE_CHECKIN',
        photosBase64?: string[] | null,
        reason?: string | null
    ) => {
        setErrorMsg(null);
        setCheckStatus('LOADING_GPS'); // Will rename this state eventually, keeping string for now to avoid breaking UI

        try {
            const res = await fetch('/api/ktv/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: user?.id,
                    employeeName: user?.name || 'KTV',
                    checkType,
                    photoBase64: photosBase64 || null,
                    reason: reason || null,
                    latitude: null,
                    longitude: null,
                    locationText: null,
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                console.error(`❌ [Attendance POST] Server returned ${res.status}:`, text);
                throw new Error(
                    res.status === 413
                        ? 'Ảnh quá lớn. Vui lòng chụp lại với chất lượng thấp hơn.'
                        : `Lỗi server (${res.status}). Vui lòng thử lại.`
                );
            }

            const result = await res.json();
            if (!result.success) throw new Error(result.error || 'Lỗi gửi yêu cầu');

            setCurrentRecord(result.data);
            setCheckStatus('PENDING');
        } catch (err: any) {
            const errorMessage = err.message || 'Lỗi không xác định';
            setErrorMsg(errorMessage);
            alert(`CẢNH BÁO: ${errorMessage}`);
            // Revert back or stay IDLE if not checked out successfully
            if (checkType === 'CHECK_IN' || checkType === 'LATE_CHECKIN') {
                setCheckStatus('IDLE');
            } else {
                setCheckStatus('CONFIRMED');
            }
        }
    }, [user?.id]);

    const handleRetry = () => {
        setCheckStatus('IDLE');
        setCurrentRecord(null);
        setErrorMsg(null);
    };

    // --- Computed ---
    const canAccessPage = hasPermission('ktv_attendance');

    /**
     * Compute whether KTV is allowed to check out right now.
     * - If no shift assigned (activeShiftType = null) → allow (fallback)
     * - SHIFT_3 ends at "00:00" → treated as 24:00 (next midnight) of the shift day
     * - No early checkout allowed: must be >= end time exactly
     */
    const { canCheckOut, checkoutBlockedUntil } = (() => {
        if (!activeShiftType || isLoadingShift) return { canCheckOut: true, checkoutBlockedUntil: null };

        const endTimeStr = SHIFT_END_TIMES[activeShiftType];
        if (!endTimeStr) return { canCheckOut: true, checkoutBlockedUntil: null };

        const vnNow = new Date(Date.now() + VN_OFFSET_MS);
        const [endHour, endMin] = endTimeStr.split(':').map(Number);

        let endMs: number;
        if (activeShiftType === 'SHIFT_3' && endHour === 0 && endMin === 0) {
            // 00:00 = midnight = start of next day → 24h from today 00:00 VN
            const todayMidnight = new Date(vnNow);
            todayMidnight.setUTCHours(todayMidnight.getUTCHours() - (VN_OFFSET_MS / 3600000)); // back to UTC
            const vnMidnight = new Date(`${vnNow.toISOString().slice(0, 10)}T00:00:00+07:00`);
            endMs = vnMidnight.getTime() + 24 * 60 * 60 * 1000; // next midnight VN
        } else {
            const vnEndStr = `${vnNow.toISOString().slice(0, 10)}T${endTimeStr}:00+07:00`;
            endMs = new Date(vnEndStr).getTime();
        }

        const nowMs = Date.now();
        const allowed = nowMs >= endMs;
        const displayTime = endTimeStr === '00:00' ? '00:00' : endTimeStr;

        return {
            canCheckOut: allowed,
            checkoutBlockedUntil: allowed ? null : displayTime,
        };
    })();

    return {
        checkStatus,
        currentRecord,
        errorMsg,
        mounted,
        initialLoading,
        canAccessPage,
        // Shift checkout control
        canCheckOut,
        checkoutBlockedUntil,
        isLoadingShift,
        activeShiftType,
        isLate,
        checkIsLate,
        handleAttendance,
        handleRetry,
    };
};
