'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    ShieldAlert, CalendarOff, Loader2, Check, X, Trash2,
    ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle,
    CalendarDays, Calendar, CalendarRange
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useLeaveManagement, ViewMode } from './LeaveManagement.logic';
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

const LeaveManagementPage = () => {
    const {
        mounted,
        canAccessPage,
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
    } = useLeaveManagement();

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
        <AppLayout title={t.pageTitle}>
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

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

            </div>
        </AppLayout>
    );
};

export default LeaveManagementPage;
