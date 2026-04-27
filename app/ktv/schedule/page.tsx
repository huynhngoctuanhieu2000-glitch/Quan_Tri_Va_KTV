'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    ShieldAlert, CalendarDays, Send, Loader2,
    CalendarOff, CheckCircle2, Clock, XCircle, AlertCircle,
    ArrowRightLeft, Briefcase, ChevronRight, ChevronLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useKTVSchedule, ScheduleTab, LeaveRequest } from './Schedule.logic';
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

const MONTH_NAMES = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

const STATUS_DOT_COLORS: Record<string, string> = {
    PENDING: 'bg-amber-400',
    APPROVED: 'bg-emerald-500',
    REJECTED: 'bg-red-400',
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
        reason, dates, isSubmittingOff, leaveList, isLoadingLeaves,
        offError, offSuccess, setReason, setDates, setOffError, handleSubmitOff,
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
                        <div className="space-y-2">
                            {dates.map((d, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="date"
                                            value={d}
                                            min={todayStr}
                                            onChange={(e) => {
                                                const newDates = [...dates];
                                                newDates[idx] = e.target.value;
                                                setDates(newDates);
                                            }}
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none text-sm bg-gray-50"
                                            required
                                        />
                                    </div>
                                    {dates.length > 1 && (
                                        <button 
                                            type="button" 
                                            onClick={() => setDates(dates.filter((_, i) => i !== idx))}
                                            className="text-red-400 hover:text-red-600 p-2 rounded-xl transition-colors shrink-0 bg-red-50"
                                        >
                                            <XCircle size={20} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => setDates([...dates, ''])}
                                className="text-sm font-bold text-rose-600 flex items-center gap-1 mt-2 px-2 hover:opacity-80"
                            >
                                + Thêm ngày khác
                            </button>
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
                        disabled={isSubmittingOff || dates.filter(d => d.trim() !== '').length === 0 || !reason}
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

            {/* ── LEAVE CALENDAR SECTION ── */}
            <LeaveCalendar logic={logic} />
        </>
    );
};

// ════════════════════════════════════════════════════════════════
// LEAVE CALENDAR COMPONENT
// ════════════════════════════════════════════════════════════════

const LeaveCalendar = ({ logic }: { logic: ReturnType<typeof useKTVSchedule> }) => {
    const {
        leaveList, isLoadingLeaves, calendarMonth,
        selectedDate, setSelectedDate,
        goToPrevMonth, goToNextMonth, goToToday, WEEKDAY_LABELS,
    } = logic;

    const { year, month } = calendarMonth;

    // Build calendar grid
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // Monday = 0, Sunday = 6 (for T2-CN layout)
    let startDow = firstDayOfMonth.getDay(); // 0=Sun, 1=Mon, ...
    startDow = startDow === 0 ? 6 : startDow - 1; // Convert to Mon=0

    // Build leave lookup: date -> LeaveRequest[]
    const leaveByDate: Record<string, LeaveRequest[]> = {};
    leaveList.forEach(leave => {
        if (!leaveByDate[leave.date]) leaveByDate[leave.date] = [];
        leaveByDate[leave.date].push(leave);
    });

    // Today string
    const todayStr = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();

    // Selected date leaves
    const selectedLeaves = selectedDate ? (leaveByDate[selectedDate] || []) : [];

    return (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
            {/* Calendar Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <button
                    onClick={goToPrevMonth}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                    <ChevronLeft size={18} className="text-gray-500" />
                </button>
                <button
                    onClick={goToToday}
                    className="text-sm font-bold text-gray-800 px-3 py-1.5 hover:bg-gray-50 rounded-xl transition-colors"
                >
                    {MONTH_NAMES[month]} {year}
                </button>
                <button
                    onClick={goToNextMonth}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                    <ChevronRight size={18} className="text-gray-500" />
                </button>
            </div>

            <div className="px-4 py-4">
                {isLoadingLeaves ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                        <Loader2 size={20} className="animate-spin" />
                        <span className="text-sm">{t.scheduleLoading}</span>
                    </div>
                ) : (
                    <>
                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {WEEKDAY_LABELS.map((day, i) => (
                                <div
                                    key={day}
                                    className={`text-center text-[10px] font-bold uppercase tracking-wider py-1 ${
                                        i === 6 ? 'text-red-400' : i === 5 ? 'text-blue-400' : 'text-gray-400'
                                    }`}
                                >
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 gap-1">
                            {/* Empty cells for days before month starts */}
                            {Array.from({ length: startDow }).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square" />
                            ))}

                            {/* Day cells */}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                const dayLeaves = leaveByDate[dateStr] || [];
                                const isToday = dateStr === todayStr;
                                const isSelected = dateStr === selectedDate;
                                const hasLeaves = dayLeaves.length > 0;

                                // Get day of week (for weekend styling)
                                const dow = (startDow + i) % 7; // 0=Mon, 5=Sat, 6=Sun

                                // Find "best" status to show (APPROVED > PENDING > REJECTED)
                                const bestStatus = dayLeaves.find(l => l.status === 'APPROVED')?.status
                                    || dayLeaves.find(l => l.status === 'PENDING')?.status
                                    || dayLeaves[0]?.status;

                                return (
                                    <button
                                        key={dateStr}
                                        onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                                        className={`
                                            aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all text-sm
                                            ${isSelected
                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 scale-105'
                                                : isToday
                                                    ? 'bg-indigo-50 text-indigo-700 border-2 border-indigo-300 font-black'
                                                    : hasLeaves
                                                        ? 'bg-gray-50 text-gray-800 hover:bg-gray-100 font-bold'
                                                        : dow === 6
                                                            ? 'text-red-300 hover:bg-red-50/50'
                                                            : dow === 5
                                                                ? 'text-blue-300 hover:bg-blue-50/50'
                                                                : 'text-gray-500 hover:bg-gray-50'
                                            }
                                        `}
                                    >
                                        <span className={`leading-none ${isToday && !isSelected ? 'text-indigo-700' : ''}`}>
                                            {day}
                                        </span>

                                        {/* Status dots */}
                                        {hasLeaves && (
                                            <div className="flex gap-0.5 mt-0.5">
                                                {dayLeaves.length <= 3
                                                    ? dayLeaves.map((leave, idx) => (
                                                        <div
                                                            key={idx}
                                                            className={`w-1.5 h-1.5 rounded-full ${
                                                                isSelected ? 'bg-white/80' : (STATUS_DOT_COLORS[leave.status] || 'bg-gray-300')
                                                            }`}
                                                        />
                                                    ))
                                                    : (
                                                        <>
                                                            <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/80' : (STATUS_DOT_COLORS[bestStatus || ''] || 'bg-gray-300')}`} />
                                                            <span className={`text-[8px] font-bold ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                                                                +{dayLeaves.length - 1}
                                                            </span>
                                                        </>
                                                    )
                                                }
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-amber-400" />
                                <span className="text-[10px] text-gray-500 font-medium">{t.statusPending}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-[10px] text-gray-500 font-medium">{t.statusApproved}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-red-400" />
                                <span className="text-[10px] text-gray-500 font-medium">{t.statusRejected}</span>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Selected day details */}
            {selectedDate && selectedLeaves.length > 0 && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-2.5 bg-gray-50/50">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        {(() => {
                            try {
                                return format(new Date(selectedDate + 'T00:00:00'), 'EEEE, dd/MM/yyyy', { locale: vi });
                            } catch { return selectedDate; }
                        })()}
                    </p>
                    {selectedLeaves.map(leave => {
                        const cfg = STATUS_COLORS[leave.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.PENDING;
                        const Icon = cfg.icon;
                        return (
                            <div key={leave.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${cfg.border} ${cfg.bg}`}>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-gray-900 truncate">{leave.employeeName}</p>
                                    {leave.reason && (
                                        <p className="text-xs text-gray-500 mt-0.5 truncate">{leave.reason}</p>
                                    )}
                                </div>
                                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${cfg.text}`}>
                                    <Icon size={11} />
                                    <span>{STATUS_LABELS[leave.status]}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Selected day empty */}
            {selectedDate && selectedLeaves.length === 0 && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                    <p className="text-xs text-gray-400 text-center">Không có ai OFF ngày này</p>
                </div>
            )}
        </div>
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
