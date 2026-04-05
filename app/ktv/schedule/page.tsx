'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    ShieldAlert, CalendarDays, Send, Loader2,
    CalendarOff, CheckCircle2, Clock, XCircle, AlertCircle,
    ArrowRightLeft, Briefcase, ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useKTVSchedule, ScheduleTab } from './Schedule.logic';
import { t } from './Schedule.i18n';

// 🔧 UI CONFIGURATION
const STATUS_COLORS = {
    PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock },
    APPROVED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 },
    REJECTED: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle },
    ACTIVE: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 },
    REPLACED: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', icon: ArrowRightLeft },
} as const;

const STATUS_LABELS: Record<string, string> = {
    PENDING: t.statusPending,
    APPROVED: t.statusApproved,
    REJECTED: t.statusRejected,
    ACTIVE: 'Đang áp dụng',
    REPLACED: 'Đã thay thế',
};

const SHIFT_LABELS: Record<string, string> = {
    SHIFT_1: t.SHIFT_1,
    SHIFT_2: t.SHIFT_2,
    SHIFT_3: t.SHIFT_3,
};

const SHIFT_COLORS: Record<string, string> = {
    SHIFT_1: 'bg-blue-600',
    SHIFT_2: 'bg-amber-600',
    SHIFT_3: 'bg-indigo-600',
};

const TAB_CONFIG: { id: ScheduleTab; label: string; icon: React.ReactNode }[] = [
    { id: 'off', label: t.tabOff, icon: <CalendarOff size={16} /> },
    { id: 'shift', label: t.tabShift, icon: <Briefcase size={16} /> },
];

const KTVSchedulePage = () => {
    const logic = useKTVSchedule();
    const {
        mounted,
        canAccessPage,
        activeTab,
        setActiveTab,
    } = logic;

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
            <div className="max-w-md mx-auto px-4 py-6 space-y-5">

                {/* Page Header */}
                <div>
                    <p className="text-sm text-gray-500">{t.pageSubtitle}</p>
                </div>

                {/* ── TAB SWITCHER ── */}
                <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
                    {TAB_CONFIG.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                activeTab === tab.id
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── TAB CONTENT ── */}
                {activeTab === 'off' ? (
                    <OffTab logic={logic} />
                ) : (
                    <ShiftTab logic={logic} />
                )}
            </div>
        </AppLayout>
    );
};

// ════════════════════════════════════════════════════════════════
// OFF TAB
// ════════════════════════════════════════════════════════════════

const OffTab = ({ logic }: { logic: ReturnType<typeof useKTVSchedule> }) => {
    const {
        reason, date, isSubmittingOff, leaveList, isLoadingLeaves,
        offError, offSuccess, setReason, setDate, setOffError, handleSubmitOff,
    } = logic;

    const todayStr = new Date().toISOString().split('T')[0];

    return (
        <>
            {/* ── FORM SECTION ── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                <div className="px-6 pt-6 pb-2">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <CalendarOff size={20} className="text-rose-500" />
                        {t.offFormTitle}
                    </h3>
                </div>
                <form onSubmit={handleSubmitOff} className="px-6 pb-6 space-y-4">
                    {/* Date picker */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.labelDate}</label>
                        <div className="relative">
                            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="date"
                                value={date}
                                min={todayStr}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none text-sm bg-gray-50"
                                required
                            />
                        </div>
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.labelReason}</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t.placeholderReason}
                            className="w-full p-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none resize-none h-24 text-sm bg-gray-50"
                            required
                        />
                    </div>

                    {/* Warnings */}
                    <div className="space-y-2">
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-800">
                            <strong>{t.warningPrefix}</strong> {t.warning}
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-xs text-blue-700 flex items-center gap-2">
                            <Clock size={14} className="shrink-0" />
                            {t.deadlineWarning}
                        </div>
                    </div>

                    {/* Error message */}
                    {offError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl px-4 py-3 flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{offError}</span>
                            <button onClick={() => setOffError(null)} className="ml-auto">
                                <XCircle size={16} />
                            </button>
                        </div>
                    )}

                    {/* Success message */}
                    {offSuccess && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-2xl px-4 py-3 flex items-center gap-2">
                            <CheckCircle2 size={16} className="shrink-0" />
                            <span>{t.submitSuccess}</span>
                        </div>
                    )}

                    {/* Submit button */}
                    <button
                        type="submit"
                        disabled={isSubmittingOff || !date || !reason}
                        className="w-full py-3.5 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-md shadow-rose-200"
                    >
                        {isSubmittingOff ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                {t.submitting}
                            </>
                        ) : (
                            <>
                                <Send size={18} />
                                {t.submit}
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* ── LEAVE SCHEDULE SECTION ── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                <div className="px-6 pt-6 pb-3">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <CalendarDays size={20} className="text-indigo-500" />
                        {t.scheduleTitle}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">{t.scheduleSubtitle}</p>
                </div>

                <div className="px-6 pb-6">
                    {/* Loading */}
                    {isLoadingLeaves && (
                        <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                            <Loader2 size={20} className="animate-spin" />
                            <span className="text-sm">{t.scheduleLoading}</span>
                        </div>
                    )}

                    {/* Empty */}
                    {!isLoadingLeaves && leaveList.length === 0 && (
                        <div className="text-center py-8">
                            <CalendarOff size={36} className="text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-400">{t.scheduleEmpty}</p>
                        </div>
                    )}

                    {/* Leave list */}
                    {!isLoadingLeaves && leaveList.length > 0 && (
                        <div className="space-y-3">
                            {leaveList.map((leave) => {
                                const statusConfig = STATUS_COLORS[leave.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.PENDING;
                                const StatusIcon = statusConfig.icon;
                                const formattedDate = (() => {
                                    try {
                                        return format(new Date(leave.date + 'T00:00:00'), 'EEEE, dd/MM', { locale: vi });
                                    } catch {
                                        return leave.date;
                                    }
                                })();

                                return (
                                    <div
                                        key={leave.id}
                                        className={`flex items-center gap-3 p-3.5 rounded-2xl border ${statusConfig.border} ${statusConfig.bg} transition-all`}
                                    >
                                        {/* Left: Date badge */}
                                        <div className="flex flex-col items-center justify-center min-w-[52px] bg-white rounded-xl p-2 shadow-sm border border-gray-100">
                                            <span className="text-lg font-black text-gray-900 leading-none">
                                                {(() => {
                                                    try { return format(new Date(leave.date + 'T00:00:00'), 'dd'); }
                                                    catch { return '--'; }
                                                })()}
                                            </span>
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase leading-tight">
                                                {(() => {
                                                    try { return format(new Date(leave.date + 'T00:00:00'), 'MMM', { locale: vi }); }
                                                    catch { return ''; }
                                                })()}
                                            </span>
                                        </div>

                                        {/* Middle: Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm text-gray-900 truncate">
                                                {leave.employeeName}
                                            </p>
                                            <p className="text-xs text-gray-500 capitalize truncate">
                                                {formattedDate}
                                            </p>
                                            {leave.reason && (
                                                <p className="text-xs text-gray-400 mt-0.5 truncate">
                                                    {leave.reason}
                                                </p>
                                            )}
                                        </div>

                                        {/* Right: Status */}
                                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusConfig.text} ${statusConfig.bg}`}>
                                            <StatusIcon size={12} />
                                            <span>{STATUS_LABELS[leave.status] || leave.status}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

// ════════════════════════════════════════════════════════════════
// SHIFT TAB
// ════════════════════════════════════════════════════════════════

const ShiftTab = ({ logic }: { logic: ReturnType<typeof useKTVSchedule> }) => {
    const {
        currentShift, pendingRequest, shiftHistory, isLoadingShift,
        newShiftType, shiftReason, isSubmittingShift,
        shiftError, shiftSuccess,
        setNewShiftType, setShiftReason, setShiftError, handleSubmitShift,
    } = logic;

    if (isLoadingShift) {
        return (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">{t.shiftLoading}</span>
            </div>
        );
    }

    // Available shifts for selection (exclude current)
    const availableShifts = ['SHIFT_1', 'SHIFT_2', 'SHIFT_3'].filter(
        s => s !== currentShift?.shiftType
    );

    return (
        <>
            {/* ── CURRENT SHIFT CARD ── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                <div className="px-6 pt-6 pb-2">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <Briefcase size={20} className="text-blue-500" />
                        {t.shiftCurrentTitle}
                    </h3>
                </div>
                <div className="px-6 pb-6">
                    {currentShift ? (
                        <div className={`flex items-center gap-4 p-4 rounded-2xl ${SHIFT_COLORS[currentShift.shiftType] || 'bg-gray-600'} text-white`}>
                            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                                <Clock size={24} />
                            </div>
                            <div className="flex-1">
                                <p className="text-lg font-black">
                                    {SHIFT_LABELS[currentShift.shiftType] || currentShift.shiftType}
                                </p>
                                <p className="text-xs font-medium opacity-80">
                                    Áp dụng từ: {(() => {
                                        try { return format(new Date(currentShift.effectiveFrom + 'T00:00:00'), 'dd/MM/yyyy'); }
                                        catch { return currentShift.effectiveFrom; }
                                    })()}
                                </p>
                            </div>
                            <CheckCircle2 size={24} className="opacity-60" />
                        </div>
                    ) : (
                        <div className="text-center py-6">
                            <AlertCircle size={36} className="text-amber-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-500 font-medium">{t.shiftNoShift}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── PENDING REQUEST BANNER ── */}
            {pendingRequest && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                    <Clock size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-amber-800">{t.shiftPendingNote}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-amber-700">
                            <span className="font-medium">
                                {SHIFT_LABELS[pendingRequest.previousShift || ''] || 'Chưa có'}
                            </span>
                            <ChevronRight size={12} />
                            <span className="font-bold">
                                {SHIFT_LABELS[pendingRequest.shiftType] || pendingRequest.shiftType}
                            </span>
                        </div>
                        {pendingRequest.reason && (
                            <p className="text-xs text-amber-600 mt-1 italic truncate">
                                &ldquo;{pendingRequest.reason}&rdquo;
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* ── SHIFT CHANGE FORM ── */}
            {!pendingRequest && currentShift && (
                <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                    <div className="px-6 pt-6 pb-2">
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <ArrowRightLeft size={20} className="text-indigo-500" />
                            {t.shiftChangeTitle}
                        </h3>
                    </div>
                    <form onSubmit={handleSubmitShift} className="px-6 pb-6 space-y-4">
                        {/* Shift selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                {t.shiftSelectNew}
                            </label>
                            <div className="space-y-2">
                                {availableShifts.map(shift => (
                                    <button
                                        key={shift}
                                        type="button"
                                        onClick={() => setNewShiftType(shift)}
                                        className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                                            newShiftType === shift
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-200'
                                        }`}
                                    >
                                        <div className={`w-3 h-3 rounded-full ${SHIFT_COLORS[shift] || 'bg-gray-400'}`} />
                                        <span className="text-sm font-bold">
                                            {SHIFT_LABELS[shift] || shift}
                                        </span>
                                        {newShiftType === shift && (
                                            <CheckCircle2 size={16} className="ml-auto text-indigo-500" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Reason */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                {t.shiftReason}
                            </label>
                            <textarea
                                value={shiftReason}
                                onChange={(e) => setShiftReason(e.target.value)}
                                placeholder={t.shiftReasonPlaceholder}
                                className="w-full p-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none resize-none h-20 text-sm bg-gray-50"
                            />
                        </div>

                        {/* Error */}
                        {shiftError && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl px-4 py-3 flex items-center gap-2">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{shiftError}</span>
                                <button onClick={() => setShiftError(null)} className="ml-auto">
                                    <XCircle size={16} />
                                </button>
                            </div>
                        )}

                        {/* Success */}
                        {shiftSuccess && (
                            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-2xl px-4 py-3 flex items-center gap-2">
                                <CheckCircle2 size={16} className="shrink-0" />
                                <span>{t.shiftSubmitSuccess}</span>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isSubmittingShift || !newShiftType}
                            className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-md shadow-indigo-200"
                        >
                            {isSubmittingShift ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    {t.shiftSubmitting}
                                </>
                            ) : (
                                <>
                                    <ArrowRightLeft size={18} />
                                    {t.shiftSubmit}
                                </>
                            )}
                        </button>
                    </form>
                </div>
            )}

            {/* ── SHIFT HISTORY ── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                <div className="px-6 pt-6 pb-3">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <CalendarDays size={20} className="text-gray-500" />
                        {t.shiftHistoryTitle}
                    </h3>
                </div>
                <div className="px-6 pb-6">
                    {shiftHistory.length === 0 ? (
                        <div className="text-center py-6">
                            <ArrowRightLeft size={30} className="text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-400">{t.shiftHistoryEmpty}</p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {shiftHistory.map(record => {
                                const statusConfig = STATUS_COLORS[record.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.PENDING;
                                const StatusIcon = statusConfig.icon;

                                return (
                                    <div
                                        key={record.id}
                                        className={`flex items-center gap-3 p-3 rounded-2xl border ${statusConfig.border} ${statusConfig.bg}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                                                <span>{SHIFT_LABELS[record.previousShift || ''] || '—'}</span>
                                                <ChevronRight size={12} className="text-gray-400" />
                                                <span>{SHIFT_LABELS[record.shiftType] || record.shiftType}</span>
                                            </div>
                                            {record.reason && (
                                                <p className="text-xs text-gray-400 mt-0.5 truncate">{record.reason}</p>
                                            )}
                                            <p className="text-[10px] text-gray-400 mt-0.5">
                                                {(() => {
                                                    try { return format(new Date(record.createdAt), 'dd/MM/yyyy'); }
                                                    catch { return record.createdAt; }
                                                })()}
                                            </p>
                                        </div>
                                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${statusConfig.text}`}>
                                            <StatusIcon size={11} />
                                            <span>{STATUS_LABELS[record.status] || record.status}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default KTVSchedulePage;
