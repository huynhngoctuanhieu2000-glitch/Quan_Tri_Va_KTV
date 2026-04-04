'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// 🔧 CONFIGURATION
const GPS_TIMEOUT_MS = 10000;
const GPS_HIGH_ACCURACY = true;

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

    // --- GPS helper ---
    const getGPS = (): Promise<{ latitude: number; longitude: number; locationText: string }> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Trình duyệt không hỗ trợ GPS'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    locationText: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
                }),
                (err) => reject(new Error(err.code === 1
                    ? 'Bạn chưa cấp quyền GPS. Vào cài đặt trình duyệt để cho phép.'
                    : 'Không lấy được vị trí GPS. Thử lại sau.'
                )),
                { enableHighAccuracy: GPS_HIGH_ACCURACY, timeout: GPS_TIMEOUT_MS }
            );
        });
    };

    // --- Handlers ---
    const handleAttendance = useCallback(async (
        checkType: 'CHECK_IN' | 'CHECK_OUT' | 'LATE_CHECKIN',
        photoBase64?: string | null,
        reason?: string | null
    ) => {
        setErrorMsg(null);
        setCheckStatus('LOADING_GPS');

        try {
            const gps = await getGPS();

            const res = await fetch('/api/ktv/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: user?.id,
                    employeeName: user?.id || 'KTV',
                    checkType,
                    photoBase64: photoBase64 || null,
                    reason: reason || null,
                    ...gps,
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
            setErrorMsg(err.message || 'Lỗi không xác định');
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
    const mapsUrl = currentRecord?.latitude && currentRecord?.longitude
        ? `https://maps.google.com/?q=${currentRecord.latitude},${currentRecord.longitude}`
        : null;

    const canAccessPage = hasPermission('ktv_attendance');

    return {
        checkStatus,
        currentRecord,
        errorMsg,
        mounted,
        initialLoading,
        mapsUrl,
        canAccessPage,
        handleAttendance,
        handleRetry,
    };
};
