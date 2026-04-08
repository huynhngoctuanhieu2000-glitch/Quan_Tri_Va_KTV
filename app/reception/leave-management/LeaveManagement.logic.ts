'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';

// --- TYPES ---
export interface StaffOption {
    id: string;
    full_name: string;
}

// 🔧 CONFIGURATION
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// --- TYPES ---
export type ViewMode = 'day' | 'week' | 'month';
export type AdminTab = 'off' | 'shift';

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

export interface ShiftRecord {
    id: string;
    employeeId: string;
    employeeName: string;
    shiftType: string;
    effectiveFrom: string;
    previousShift: string | null;
    reason: string | null;
    status: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    createdAt: string;
}

/**
 * Get current VN time as a Date object.
 */
const getVnNow = () => new Date(Date.now() + VN_OFFSET_MS);

/**
 * Custom hook for Admin Leave Management page.
 * Supports Day / Week / Month view modes with offset navigation.
 */
export const useLeaveManagement = () => {
    const { hasPermission, user } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [leaveList, setLeaveList] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

    // Admin tab state
    const [adminTab, setAdminTab] = useState<AdminTab>('off');

    // View mode + offset (0 = current, -1 = previous, 1 = next)
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [offset, setOffset] = useState(0);

    useEffect(() => { setMounted(true); }, []);

    const canAccessPage = hasPermission('leave_management');

    // Calculate date range from viewMode + offset
    const dateRange = useMemo(() => {
        const vnNow = getVnNow();
        let from: Date;
        let to: Date;

        if (viewMode === 'day') {
            const target = new Date(vnNow);
            target.setDate(target.getDate() + offset);
            from = target;
            to = target;
        } else if (viewMode === 'week') {
            const target = new Date(vnNow);
            target.setDate(target.getDate() + offset * 7);
            // Start of week (Monday)
            const dayOfWeek = target.getDay();
            const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            from = new Date(target);
            from.setDate(target.getDate() + mondayDiff);
            to = new Date(from);
            to.setDate(from.getDate() + 6);
        } else {
            // Month
            from = new Date(vnNow.getFullYear(), vnNow.getMonth() + offset, 1);
            to = new Date(vnNow.getFullYear(), vnNow.getMonth() + offset + 1, 0);
        }

        return {
            from: from.toISOString().split('T')[0],
            to: to.toISOString().split('T')[0],
        };
    }, [viewMode, offset]);

    // Generate display label for current range
    const rangeLabel = useMemo(() => {
        const vnNow = getVnNow();

        if (viewMode === 'day') {
            const target = new Date(vnNow);
            target.setDate(target.getDate() + offset);
            const day = String(target.getDate()).padStart(2, '0');
            const month = String(target.getMonth() + 1).padStart(2, '0');
            return `${day}/${month}/${target.getFullYear()}`;
        } else if (viewMode === 'week') {
            return `${formatShortDate(dateRange.from)} — ${formatShortDate(dateRange.to)}`;
        } else {
            const target = new Date(vnNow.getFullYear(), vnNow.getMonth() + offset, 1);
            return `Tháng ${target.getMonth() + 1}/${target.getFullYear()}`;
        }
    }, [viewMode, offset, dateRange]);

    // --- Fetch leave list ---
    const fetchLeaveList = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/ktv/leave?from=${dateRange.from}&to=${dateRange.to}`);
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
    }, [dateRange]);

    useEffect(() => {
        if (mounted && canAccessPage) {
            fetchLeaveList();
        }
    }, [mounted, canAccessPage, fetchLeaveList]);

    // Reset offset when view mode changes
    const changeViewMode = useCallback((mode: ViewMode) => {
        setViewMode(mode);
        setOffset(0);
    }, []);

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
        viewMode,
        changeViewMode,
        offset,
        setOffset,
        rangeLabel,
        handleAction,
        handleDelete,
        adminTab,
        setAdminTab,
    };
};

/**
 * Hook for Shift Management (admin side).
 */
export const useShiftManagement = () => {
    const { user } = useAuth();
    const [allShifts, setAllShifts] = useState<ShiftRecord[]>([]);
    const [pendingShifts, setPendingShifts] = useState<ShiftRecord[]>([]);
    const [isLoadingShifts, setIsLoadingShifts] = useState(true);
    const [shiftActionLoading, setShiftActionLoading] = useState<Record<string, string>>({});

    // Staff list for dropdown
    const [staffList, setStaffList] = useState<StaffOption[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(false);

    // Assign modal state
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assignEmployeeId, setAssignEmployeeId] = useState('');
    const [assignEmployeeName, setAssignEmployeeName] = useState('');
    const [assignShiftType, setAssignShiftType] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);

    const fetchShifts = useCallback(async () => {
        setIsLoadingShifts(true);
        try {
            const [allRes, pendingRes] = await Promise.all([
                fetch('/api/ktv/shift?all=true'),
                fetch('/api/ktv/shift?pending=true'),
            ]);
            const allResult = await allRes.json();
            const pendingResult = await pendingRes.json();

            if (allResult.success) setAllShifts(allResult.data || []);
            if (pendingResult.success) setPendingShifts(pendingResult.data || []);
        } catch (err) {
            console.error('❌ [ShiftManagement] Fetch error:', err);
        } finally {
            setIsLoadingShifts(false);
        }
    }, []);

    // Fetch all active staff for dropdown
    const fetchStaffList = useCallback(async () => {
        setIsLoadingStaff(true);
        try {
            const res = await fetch('/api/staff/list');
            const result = await res.json();
            if (result.success) {
                setStaffList(result.data || []);
            }
        } catch (err) {
            console.error('❌ [ShiftManagement] Fetch staff error:', err);
        } finally {
            setIsLoadingStaff(false);
        }
    }, []);

    useEffect(() => { fetchShifts(); }, [fetchShifts]);
    useEffect(() => { fetchStaffList(); }, [fetchStaffList]);

    // Approve / Reject shift change
    const handleShiftAction = async (shiftId: string, action: 'APPROVE' | 'REJECT') => {
        setShiftActionLoading(prev => ({ ...prev, [shiftId]: action.toLowerCase() }));
        try {
            const res = await fetch('/api/ktv/shift', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shiftId, action, adminId: user?.id }),
            });
            const result = await res.json();
            if (result.success) {
                fetchShifts();
            } else {
                alert(result.error || 'Lỗi xử lý');
            }
        } catch (err) {
            console.error('❌ [ShiftManagement] Action error:', err);
        } finally {
            setShiftActionLoading(prev => { const next = { ...prev }; delete next[shiftId]; return next; });
        }
    };

    // Admin assigns shift directly
    const handleAssignShift = async () => {
        if (!assignEmployeeId || !assignShiftType) return;
        setIsAssigning(true);
        // Resolve employee name from staffList
        const selectedStaff = staffList.find(s => s.id === assignEmployeeId);
        const resolvedName = selectedStaff?.full_name || assignEmployeeId;
        try {
            const res = await fetch('/api/ktv/shift', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: assignEmployeeId,
                    employeeName: resolvedName,
                    shiftType: assignShiftType,
                    assignedByAdmin: true,
                    adminId: user?.id,
                }),
            });
            const result = await res.json();
            if (result.success) {
                setAssignModalOpen(false);
                setAssignEmployeeId('');
                setAssignEmployeeName('');
                setAssignShiftType('');
                fetchShifts();
            } else {
                alert(result.error || 'Lỗi gán ca');
            }
        } catch (err) {
            console.error('❌ [ShiftManagement] Assign error:', err);
        } finally {
            setIsAssigning(false);
        }
    };

    const openAssignModal = (employeeId?: string, employeeName?: string) => {
        setAssignEmployeeId(employeeId || '');
        setAssignEmployeeName(employeeName || '');
        setAssignShiftType('');
        setAssignModalOpen(true);
    };

    // Computed: KTVs who have an ACTIVE shift (by employeeId)
    const assignedEmployeeIds = useMemo(
        () => new Set(allShifts.map(s => s.employeeId)),
        [allShifts]
    );

    // KTVs without any active shift assignment
    const unassignedStaff = useMemo(
        () => staffList.filter(s => !assignedEmployeeIds.has(s.id)),
        [staffList, assignedEmployeeIds]
    );

    return {
        allShifts,
        pendingShifts,
        isLoadingShifts,
        shiftActionLoading,
        handleShiftAction,
        fetchShifts,
        // Staff dropdown
        staffList,
        isLoadingStaff,
        unassignedStaff,
        // Assign modal
        assignModalOpen,
        setAssignModalOpen,
        assignEmployeeId,
        setAssignEmployeeId,
        assignEmployeeName,
        setAssignEmployeeName,
        assignShiftType,
        setAssignShiftType,
        isAssigning,
        handleAssignShift,
        openAssignModal,
    };
};

// --- Helpers ---
function formatShortDate(dateStr: string): string {
    const [, m, d] = dateStr.split('-');
    return `${d}/${m}`;
}
