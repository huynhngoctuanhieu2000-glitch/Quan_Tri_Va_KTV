'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    ShieldAlert, CalendarOff, Loader2, Check, X, Trash2,
    ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle,
    CalendarDays, Calendar, CalendarRange, Briefcase,
    ArrowRightLeft, UserPlus, Users
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useLeaveManagement, useShiftManagement, ViewMode, AdminTab } from './LeaveManagement.logic';
import { t } from './LeaveManagement.i18n';

// 🔧 UI CONFIGURATION
const STATUS_CONFIG = {
    PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock, label: t.statusPending },
    APPROVED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2, label: t.statusApproved },
    REJECTED: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: XCircle, label: t.statusRejected },
} as const;

const STAT_CARDS = [
    { key: 'total' as const, label: t.statTotal, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    { key: 'pending' as const, label: t.statPending, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    { key: 'approved' as const, label: t.statApproved, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { key: 'rejected' as const, label: t.statRejected, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
];

const VIEW_MODE_OPTIONS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'day', label: 'Ngày', icon: <Calendar size={14} /> },
    { id: 'week', label: 'Tuần', icon: <CalendarRange size={14} /> },
    { id: 'month', label: 'Tháng', icon: <CalendarDays size={14} /> },
];

const ADMIN_TAB_CONFIG: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'off', label: t.tabOff, icon: <CalendarOff size={16} /> },
    { id: 'shift', label: t.tabShift, icon: <Briefcase size={16} /> },
];

const SHIFT_LABELS: Record<string, string> = {
    SHIFT_1: t.SHIFT_1,
    SHIFT_2: t.SHIFT_2,
    SHIFT_3: t.SHIFT_3,
};

const SHIFT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    SHIFT_1: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    SHIFT_2: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    SHIFT_3: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
};

const LeaveManagementPage = () => {
    const leaveLogic = useLeaveManagement();
    const shiftLogic = useShiftManagement();

    const {
        mounted,
        canAccessPage,
        adminTab,
        setAdminTab,
    } = leaveLogic;

    if (!mounted) return null;

    if (!canAccessPage) {
        return (
            <AppLayout title={t.pageTitle}>
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <ShieldAlert size={48} className="text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">{t.noAccess}</h2>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title={t.pageTitle}>
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

                {/* ── ADMIN TAB SWITCHER ── */}
                <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
                    {ADMIN_TAB_CONFIG.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setAdminTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                adminTab === tab.id
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                            {/* Badge for pending shifts */}
                            {tab.id === 'shift' && shiftLogic.pendingShifts.length > 0 && (
                                <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                    {shiftLogic.pendingShifts.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ── TAB CONTENT ── */}
                {adminTab === 'off' ? (
                    <OffTab logic={leaveLogic} />
                ) : (
                    <ShiftManagementTab logic={shiftLogic} />
                )}
            </div>
        </AppLayout>
    );
};

// ════════════════════════════════════════════════════════════════
// OFF TAB (existing leave management)
// ════════════════════════════════════════════════════════════════

const OffTab = ({ logic }: { logic: ReturnType<typeof useLeaveManagement> }) => {
    const {
        isLoading,
        actionLoading,
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
    } = logic;

    const formatLeaveDate = (dateStr: string) => {
        try {
            return format(new Date(dateStr + 'T00:00:00'), 'EEEE, dd/MM', { locale: vi });
        } catch {
            return dateStr;
        }
    };

    const formatDay = (dateStr: string) => {
        try { return format(new Date(dateStr + 'T00:00:00'), 'dd'); }
        catch { return '--'; }
    };

    const formatMonth = (dateStr: string) => {
        try { return format(new Date(dateStr + 'T00:00:00'), 'MMM', { locale: vi }); }
        catch { return ''; }
    };

    const formatCreatedAt = (dateStr: string) => {
        try {
            return format(new Date(dateStr), 'HH:mm — dd/MM', { locale: vi });
        } catch {
            return dateStr;
        }
    };

    return (
        <>
            {/* ── Header: View Mode Tabs + Date Navigator ── */}
            <div className="space-y-3">
                {/* View mode switcher */}
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-500 hidden sm:block">{t.pageSubtitle}</p>
                    <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
                        {VIEW_MODE_OPTIONS.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => changeViewMode(opt.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                                    ${viewMode === opt.id
                                        ? 'bg-white text-indigo-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {opt.icon}
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Date range navigator */}
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => setOffset(prev => prev - 1)}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        <ChevronLeft size={18} className="text-gray-500" />
                    </button>
                    <button
                        onClick={() => setOffset(0)}
                        className="text-sm font-bold text-gray-800 px-4 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm min-w-[160px] text-center hover:bg-gray-50 transition-colors"
                    >
                        {rangeLabel}
                    </button>
                    <button
                        onClick={() => setOffset(prev => prev + 1)}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        <ChevronRight size={18} className="text-gray-500" />
                    </button>
                </div>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                    <Loader2 size={24} className="animate-spin" />
                    <span className="text-sm font-medium">{t.loading}</span>
                </div>
            )}

            {!isLoading && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-4 gap-3">
                        {STAT_CARDS.map(card => (
                            <div key={card.key} className={`${card.bg} border ${card.border} rounded-2xl p-3.5 text-center`}>
                                <p className={`text-2xl font-black ${card.color}`}>{stats[card.key]}</p>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-0.5">{card.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* ── PENDING SECTION ── */}
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                            <Clock size={18} className="text-amber-500" />
                            <h3 className="text-base font-bold text-gray-900">{t.pendingTitle}</h3>
                            {pendingList.length > 0 && (
                                <span className="ml-auto bg-amber-100 text-amber-700 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                                    {pendingList.length}
                                </span>
                            )}
                        </div>

                        {pendingList.length === 0 ? (
                            <div className="text-center py-10">
                                <CalendarOff size={36} className="text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-400">{t.pendingEmpty}</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {pendingList.map(leave => {
                                    const loadState = actionLoading[leave.id];
                                    return (
                                        <div key={leave.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50/50 transition-colors">
                                            {/* Left: Date badge */}
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className="flex flex-col items-center justify-center min-w-[48px] bg-amber-50 rounded-xl p-2 border border-amber-200">
                                                    <span className="text-lg font-black text-gray-900 leading-none">
                                                        {formatDay(leave.date)}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase leading-tight">
                                                        {formatMonth(leave.date)}
                                                    </span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm text-gray-900 truncate">
                                                        {leave.employeeName}
                                                    </p>
                                                    <p className="text-xs text-gray-500 capitalize">
                                                        {formatLeaveDate(leave.date)}
                                                    </p>
                                                    {leave.reason && (
                                                        <p className="text-xs text-gray-400 mt-0.5 truncate italic">
                                                            &ldquo;{leave.reason}&rdquo;
                                                        </p>
                                                    )}
                                                    {/* Submission time */}
                                                    <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                                                        <Clock size={10} />
                                                        Gửi lúc: {formatCreatedAt(leave.createdAt)}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Right: Action buttons */}
                                            <div className="flex gap-1.5 shrink-0">
                                                <button
                                                    onClick={() => handleAction(leave.id, 'APPROVE')}
                                                    disabled={!!loadState}
                                                    className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all disabled:opacity-50 shadow-sm active:scale-95"
                                                    title={t.approve}
                                                >
                                                    {loadState === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                                                </button>
                                                <button
                                                    onClick={() => handleAction(leave.id, 'REJECT')}
                                                    disabled={!!loadState}
                                                    className="p-2.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-all disabled:opacity-50"
                                                    title={t.reject}
                                                >
                                                    {loadState === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} strokeWidth={3} />}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(leave.id)}
                                                    disabled={!!loadState}
                                                    className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl transition-all disabled:opacity-50"
                                                    title={t.delete}
                                                >
                                                    {loadState === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── PROCESSED SECTION ── */}
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                            <CalendarDays size={18} className="text-indigo-500" />
                            <h3 className="text-base font-bold text-gray-900">{t.historyTitle}</h3>
                            {processedList.length > 0 && (
                                <span className="ml-auto text-xs text-gray-400 font-medium">
                                    {processedList.length} yêu cầu
                                </span>
                            )}
                        </div>

                        {processedList.length === 0 ? (
                            <div className="text-center py-10">
                                <CalendarOff size={36} className="text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-400">{t.historyEmpty}</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {processedList.map(leave => {
                                    const config = STATUS_CONFIG[leave.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING;
                                    const StatusIcon = config.icon;
                                    const loadState = actionLoading[leave.id];

                                    return (
                                        <div key={leave.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                                            {/* Date badge */}
                                            <div className={`flex flex-col items-center justify-center min-w-[48px] rounded-xl p-2 border ${config.border} ${config.bg}`}>
                                                <span className="text-lg font-black text-gray-900 leading-none">
                                                    {formatDay(leave.date)}
                                                </span>
                                                <span className="text-[9px] font-bold text-gray-400 uppercase leading-tight">
                                                    {formatMonth(leave.date)}
                                                </span>
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm text-gray-900 truncate">
                                                    {leave.employeeName}
                                                </p>
                                                <p className="text-xs text-gray-500 capitalize">
                                                    {formatLeaveDate(leave.date)}
                                                </p>
                                                {leave.reason && (
                                                    <p className="text-xs text-gray-400 mt-0.5 truncate italic">
                                                        &ldquo;{leave.reason}&rdquo;
                                                    </p>
                                                )}
                                            </div>

                                            {/* Status + Delete */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${config.text} ${config.bg} border ${config.border}`}>
                                                    <StatusIcon size={12} />
                                                    <span>{config.label}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleDelete(leave.id)}
                                                    disabled={!!loadState}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                                                    title={t.delete}
                                                >
                                                    {loadState === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </>
    );
};

// ════════════════════════════════════════════════════════════════
// SHIFT MANAGEMENT TAB (NEW)
// ════════════════════════════════════════════════════════════════

const ShiftManagementTab = ({ logic }: { logic: ReturnType<typeof useShiftManagement> }) => {
    const {
        allShifts,
        pendingShifts,
        isLoadingShifts,
        shiftActionLoading,
        handleShiftAction,
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
    } = logic;

    if (isLoadingShifts) {
        return (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-sm font-medium">{t.loading}</span>
            </div>
        );
    }

    return (
        <>
            {/* ── PENDING SHIFT CHANGES ── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <ArrowRightLeft size={18} className="text-amber-500" />
                    <h3 className="text-base font-bold text-gray-900">{t.shiftPendingTitle}</h3>
                    {pendingShifts.length > 0 && (
                        <span className="ml-auto bg-amber-100 text-amber-700 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                            {pendingShifts.length}
                        </span>
                    )}
                </div>

                {pendingShifts.length === 0 ? (
                    <div className="text-center py-8">
                        <ArrowRightLeft size={30} className="text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">{t.shiftPendingEmpty}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {pendingShifts.map(shift => {
                            const loadState = shiftActionLoading[shift.id];
                            const prevLabel = SHIFT_LABELS[shift.previousShift || ''] || 'Chưa có ca';
                            const newLabel = SHIFT_LABELS[shift.shiftType] || shift.shiftType;

                            return (
                                <div key={shift.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50/50 transition-colors">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center shrink-0">
                                            <ArrowRightLeft size={18} className="text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm text-gray-900 truncate">{shift.employeeName}</p>
                                            <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-0.5">
                                                <span className="font-medium">{prevLabel}</span>
                                                <ChevronRight size={12} className="text-gray-400" />
                                                <span className="font-bold text-indigo-600">{newLabel}</span>
                                            </div>
                                            {shift.reason && (
                                                <p className="text-xs text-gray-400 mt-0.5 truncate italic">
                                                    &ldquo;{shift.reason}&rdquo;
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-1.5 shrink-0">
                                        <button
                                            onClick={() => handleShiftAction(shift.id, 'APPROVE')}
                                            disabled={!!loadState}
                                            className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all disabled:opacity-50 shadow-sm active:scale-95"
                                            title={t.approve}
                                        >
                                            {loadState === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                                        </button>
                                        <button
                                            onClick={() => handleShiftAction(shift.id, 'REJECT')}
                                            disabled={!!loadState}
                                            className="p-2.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-all disabled:opacity-50"
                                            title={t.reject}
                                        >
                                            {loadState === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} strokeWidth={3} />}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── CURRENT SHIFT OVERVIEW ── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <Users size={18} className="text-indigo-500" />
                    <h3 className="text-base font-bold text-gray-900">{t.shiftOverviewTitle}</h3>
                    <button
                        onClick={() => openAssignModal()}
                        className="ml-auto flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-colors"
                    >
                        <UserPlus size={13} />
                        {t.shiftAssign}
                    </button>
                </div>

                {allShifts.length === 0 ? (
                    <div className="text-center py-8">
                        <Briefcase size={30} className="text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">{t.shiftOverviewEmpty}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {allShifts.map(shift => {
                            const shiftColor = SHIFT_COLORS[shift.shiftType] || { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' };
                            
                            return (
                                <div key={shift.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                                    {/* Avatar placeholder */}
                                    <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                                        {shift.employeeName?.charAt(0) || '?'}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm text-gray-900 truncate">{shift.employeeName}</p>
                                        <p className="text-[10px] text-gray-400 truncate">{shift.employeeId}</p>
                                    </div>

                                    {/* Shift badge */}
                                    <div className={`px-3 py-1.5 rounded-xl text-xs font-bold ${shiftColor.bg} ${shiftColor.text} border ${shiftColor.border}`}>
                                        {SHIFT_LABELS[shift.shiftType] || shift.shiftType}
                                    </div>

                                    {/* Action */}
                                    <button
                                        onClick={() => openAssignModal(shift.employeeId, shift.employeeName)}
                                        className="p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                        title={t.shiftChange}
                                    >
                                        <ArrowRightLeft size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── ASSIGN SHIFT MODAL ── */}
            {assignModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
                        <h3 className="text-lg font-black text-gray-900 text-center">
                            {t.shiftAssignTitle}
                        </h3>

                        {/* Employee ID input */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 block">Mã KTV</label>
                            <input
                                type="text"
                                value={assignEmployeeId}
                                onChange={e => setAssignEmployeeId(e.target.value)}
                                placeholder="VD: NH016"
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>

                        {/* Employee name input */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 block">Tên KTV</label>
                            <input
                                type="text"
                                value={assignEmployeeName}
                                onChange={e => setAssignEmployeeName(e.target.value)}
                                placeholder="VD: Nguyễn Văn A"
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>

                        {/* Shift selector */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 block">Chọn Ca</label>
                            <div className="space-y-2">
                                {['SHIFT_1', 'SHIFT_2', 'SHIFT_3'].map(shift => (
                                    <button
                                        key={shift}
                                        type="button"
                                        onClick={() => setAssignShiftType(shift)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                                            assignShiftType === shift
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-200'
                                        }`}
                                    >
                                        <div className={`w-2.5 h-2.5 rounded-full ${
                                            shift === 'SHIFT_1' ? 'bg-blue-600' : shift === 'SHIFT_2' ? 'bg-amber-600' : 'bg-indigo-600'
                                        }`} />
                                        <span className="text-sm font-bold">{SHIFT_LABELS[shift]}</span>
                                        {assignShiftType === shift && <CheckCircle2 size={14} className="ml-auto text-indigo-500" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setAssignModalOpen(false)}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleAssignShift}
                                disabled={!assignEmployeeId || !assignShiftType || isAssigning}
                                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all"
                            >
                                {isAssigning ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                {t.shiftAssign}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default LeaveManagementPage;
