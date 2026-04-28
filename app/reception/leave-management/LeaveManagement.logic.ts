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
 * Supports Calendar Month view.
 */
export const useLeaveManagement = () => {
    const { hasPermission } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [leaveList, setLeaveList] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

    // Admin tab state
    const [adminTab, setAdminTab] = useState<AdminTab>('off');

    // ── Calendar state ──
    const [calendarMonth, setCalendarMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() }; // 0-indexed
    });
    
    // Day selected by manager to view details
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    useEffect(() => { setMounted(true); }, []);

    const canAccessPage = hasPermission('leave_management');

    // --- Fetch leave list ---
    const fetchLeaveList = useCallback(async () => {
        setIsLoading(true);
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
                console.error('❌ [LeaveManagement] Fetch error:', result.error);
            }
        } catch (err) {
            console.error('❌ [LeaveManagement] Fetch failed:', err);
        } finally {
            setIsLoading(false);
        }
    }, [calendarMonth]);

    useEffect(() => {
        if (mounted) {
            fetchLeaveList();
        }
    }, [mounted, fetchLeaveList]);

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

    return {
        mounted,
        canAccessPage,
        isLoading,
        actionLoading,
        leaveList,
        handleDelete,
        adminTab,
        setAdminTab,
        // Calendar
        calendarMonth,
        selectedDate,
        setSelectedDate,
        goToPrevMonth,
        goToNextMonth,
        goToToday,
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
