'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

// 🔧 CONFIGURATION
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// --- TYPES ---
export interface LeaveRequest {
    id: string;
    employeeId: string;
    employeeName: string;
    date: string;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewedBy?: string | null;
    reviewedAt?: string | null;
    createdAt: string;
}

/**
 * Custom hook for Admin Leave Management page.
 * Handles fetching, filtering, approving, rejecting, and deleting leave requests.
 */
export const useLeaveManagement = () => {
    const { hasPermission, user } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [leaveList, setLeaveList] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

    // Filter: month offset (0 = current month, -1 = last month, 1 = next month)
    const [monthOffset, setMonthOffset] = useState(0);

    useEffect(() => { setMounted(true); }, []);

    const canAccessPage = hasPermission('leave_management');

    // Calculate date range from monthOffset
    const getDateRange = useCallback(() => {
        const now = new Date();
        const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
        const targetMonth = new Date(vnNow.getFullYear(), vnNow.getMonth() + monthOffset, 1);
        const from = targetMonth.toISOString().split('T')[0];
        const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
        const to = lastDay.toISOString().split('T')[0];
        return { from, to };
    }, [monthOffset]);

    // Get display month label
    const getMonthLabel = useCallback(() => {
        const now = new Date();
        const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
        const targetMonth = new Date(vnNow.getFullYear(), vnNow.getMonth() + monthOffset, 1);
        return `Tháng ${targetMonth.getMonth() + 1}/${targetMonth.getFullYear()}`;
    }, [monthOffset]);

    // --- Fetch leave list ---
    const fetchLeaveList = useCallback(async () => {
        setIsLoading(true);
        try {
            const { from, to } = getDateRange();
            const res = await fetch(`/api/ktv/leave?from=${from}&to=${to}`);
            const result = await res.json();

            if (result.success) {
                setLeaveList(result.data || []);
            } else {
                console.error('❌ [LeaveManagement] Fetch error:', result.error);
            }
        } catch (err) {
            console.error('❌ [LeaveManagement] Fetch failed:', err);
        } finally {
            setIsLoading(false);
        }
    }, [getDateRange]);

    useEffect(() => {
        if (mounted && canAccessPage) {
            fetchLeaveList();
        }
    }, [mounted, canAccessPage, fetchLeaveList]);

    // --- Approve / Reject ---
    const handleAction = async (leaveId: string, action: 'APPROVE' | 'REJECT') => {
        setActionLoading(prev => ({ ...prev, [leaveId]: action === 'APPROVE' ? 'approve' : 'reject' }));
        try {
            const res = await fetch('/api/ktv/leave', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leaveId, action, adminId: user?.id }),
            });
            const result = await res.json();
            if (result.success) {
                fetchLeaveList();
            } else {
                alert(result.error || 'Lỗi xử lý');
            }
        } catch (err) {
            console.error('❌ [LeaveManagement] Action error:', err);
        } finally {
            setActionLoading(prev => { const next = { ...prev }; delete next[leaveId]; return next; });
        }
    };

    // --- Delete ---
    const handleDelete = async (leaveId: string) => {
        if (!confirm('Bạn chắc chắn muốn xoá yêu cầu này?')) return;

        setActionLoading(prev => ({ ...prev, [leaveId]: 'delete' }));
        try {
            const res = await fetch(`/api/ktv/leave?id=${leaveId}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
                fetchLeaveList();
            } else {
                alert(result.error || 'Lỗi xoá');
            }
        } catch (err) {
            console.error('❌ [LeaveManagement] Delete error:', err);
        } finally {
            setActionLoading(prev => { const next = { ...prev }; delete next[leaveId]; return next; });
        }
    };

    // --- Computed ---
    const pendingList = leaveList.filter(l => l.status === 'PENDING');
    const processedList = leaveList.filter(l => l.status !== 'PENDING');

    const stats = {
        total: leaveList.length,
        pending: pendingList.length,
        approved: leaveList.filter(l => l.status === 'APPROVED').length,
        rejected: leaveList.filter(l => l.status === 'REJECTED').length,
    };

    return {
        mounted,
        canAccessPage,
        isLoading,
        actionLoading,
        leaveList,
        pendingList,
        processedList,
        stats,
        monthOffset,
        setMonthOffset,
        getMonthLabel,
        handleAction,
        handleDelete,
    };
};
