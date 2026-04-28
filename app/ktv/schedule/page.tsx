'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    ShieldAlert, Loader2, CalendarOff, CheckCircle2, Clock, XCircle, AlertCircle, ChevronRight, ChevronLeft, Send, Lock
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useKTVSchedule, LeaveRequest } from './Schedule.logic';
import { t } from './Schedule.i18n';

// 🔧 UI CONFIGURATION
const STATUS_COLORS = {
    PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock },
    APPROVED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 },
    REJECTED: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle },
} as const;

const STATUS_LABELS: Record<string, string> = {
    PENDING: t.statusPending,
    APPROVED: t.statusApproved,
    REJECTED: t.statusRejected,
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

const BLOCKED_HOLIDAYS = ['04-30', '05-01', '09-02', '01-01'];

const KTVSchedulePage = () => {
    const logic = useKTVSchedule();
    const {
        mounted, canAccessPage, user,
        selectedDates, toggleDate, isSubmittingOff, leaveList, isLoadingLeaves,
        offError, offSuccess, setOffError, handleSubmitOff,
        calendarMonth, goToPrevMonth, goToNextMonth, goToToday, WEEKDAY_LABELS,
    } = logic;

    const [viewDate, setViewDate] = useState<string | null>(null);

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

    const { year, month } = calendarMonth;
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    let startDow = firstDayOfMonth.getDay(); 
    startDow = startDow === 0 ? 6 : startDow - 1; 

    const leaveByDate: Record<string, LeaveRequest[]> = {};
    leaveList.forEach(leave => {
        if (!leaveByDate[leave.date]) leaveByDate[leave.date] = [];
        leaveByDate[leave.date].push(leave);
    });

    const todayStr = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();

    const tomorrowStr = (() => {
        const now = new Date();
        now.setDate(now.getDate() + 1);
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();

    const handleDateClick = (dateStr: string) => {
        // Luôn set viewDate để xem ai off
        setViewDate(dateStr);
        
        // Kiểm tra xem user hiện tại đã đăng ký ngày này chưa
        const dayLeaves = leaveByDate[dateStr] || [];
        const myLeave = dayLeaves.find(l => l.employeeId === user?.id);
        const isBlocked = BLOCKED_HOLIDAYS.includes(dateStr.slice(5));

        // Chỉ cho phép chọn/huỷ chọn những ngày > today VÀ chưa từng đăng ký VÀ không bị khoá
        if (!myLeave && !isBlocked) {
            const isSelected = selectedDates.includes(dateStr);
            
            // Nếu đang CHỌN THÊM (chưa có trong selectedDates)
            if (!isSelected) {
                if (dateStr <= todayStr) {
                    setOffError('Chỉ có thể đăng ký OFF từ ngày mai trở đi.');
                    return;
                }
                
                const nowHour = new Date().getHours();
                if (dateStr === tomorrowStr && nowHour >= 19) {
                    setOffError('Sau 19h00 không thể đăng ký OFF cho ngày mai.');
                    return;
                }
            }
            
            // Clear error and toggle
            setOffError(null);
            toggleDate(dateStr);
        }
    };

    // Dates for viewing info: if they selected multiple, show all?
    // User requested: "chỉ hiển thị ds off ngày đó". So we use viewDate, or if multiple selected, show the last one, or combine.
    // Let's combine the leaveList for all selectedDates, plus viewDate if it's not in selectedDates.
    const displayDatesSet = new Set<string>();
    selectedDates.forEach(d => displayDatesSet.add(d));
    if (viewDate) displayDatesSet.add(viewDate);
    const sortedDisplayDates = Array.from(displayDatesSet).sort();

    return (
        <AppLayout title={t.pageTitle}>
            <div className="max-w-md mx-auto px-4 py-6 space-y-5">
                
                <div>
                    <p className="text-sm text-gray-500">{t.pageSubtitle}</p>
                </div>

                {/* ── CALENDAR ── */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                        <button onClick={goToPrevMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                            <ChevronLeft size={18} className="text-gray-500" />
                        </button>
                        <button onClick={goToToday} className="text-sm font-bold text-gray-800 px-3 py-1.5 hover:bg-gray-50 rounded-xl transition-colors">
                            {MONTH_NAMES[month]} {year}
                        </button>
                        <button onClick={goToNextMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
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
                                <div className="grid grid-cols-7 gap-1 mb-2">
                                    {WEEKDAY_LABELS.map((day, i) => (
                                        <div key={day} className={`text-center text-[10px] font-bold uppercase tracking-wider py-1 ${i === 6 ? 'text-red-400' : i === 5 ? 'text-blue-400' : 'text-gray-400'}`}>
                                            {day}
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-7 gap-1">
                                    {Array.from({ length: startDow }).map((_, i) => (
                                        <div key={`empty-${i}`} className="aspect-square" />
                                    ))}

                                    {Array.from({ length: daysInMonth }).map((_, i) => {
                                        const day = i + 1;
                                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const dayLeaves = leaveByDate[dateStr] || [];
                                        const isToday = dateStr === todayStr;
                                        const isPast = dateStr < todayStr;
                                        const isBlocked = BLOCKED_HOLIDAYS.includes(dateStr.slice(5));
                                        const isSelected = selectedDates.includes(dateStr);
                                        const hasLeaves = dayLeaves.length > 0;
                                        const dow = (startDow + i) % 7; 
                                        
                                        // Kiểm tra xem user hiện tại đã đăng ký ngày này chưa
                                        const myLeave = dayLeaves.find(l => l.employeeId === user?.id);
                                        
                                        let cellStyle = 'text-gray-500 hover:bg-gray-50';
                                        
                                        if (isBlocked) {
                                            cellStyle = 'bg-gray-100 text-gray-400 cursor-not-allowed';
                                        } else if (isSelected) {
                                            cellStyle = 'bg-rose-500 text-white shadow-md shadow-rose-200 scale-105 font-bold';
                                        } else if (myLeave) {
                                            if (myLeave.status === 'APPROVED') {
                                                cellStyle = 'bg-emerald-500 text-white shadow-md shadow-emerald-200 font-bold';
                                            } else if (myLeave.status === 'PENDING') {
                                                cellStyle = 'bg-amber-400 text-white shadow-md shadow-amber-200 font-bold';
                                            } else {
                                                cellStyle = 'bg-red-400 text-white shadow-md shadow-red-200 font-bold';
                                            }
                                        } else if (isToday) {
                                            cellStyle = 'bg-indigo-50 text-indigo-700 border-2 border-indigo-300 font-black';
                                        } else if (isPast) {
                                            cellStyle = 'text-gray-300 bg-gray-50/30';
                                        } else if (hasLeaves) {
                                            cellStyle = 'bg-gray-50 text-gray-800 hover:bg-gray-100 font-bold';
                                        } else if (dow === 6) {
                                            cellStyle = 'text-red-300 hover:bg-red-50/50';
                                        } else if (dow === 5) {
                                            cellStyle = 'text-blue-300 hover:bg-blue-50/50';
                                        }

                                        return (
                                            <button
                                                key={dateStr}
                                                onClick={() => handleDateClick(dateStr)}
                                                className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all text-sm ${cellStyle}`}
                                            >
                                                <span className={`leading-none ${isToday && !isSelected && !myLeave && !isBlocked ? 'text-indigo-700' : ''}`}>
                                                    {day}
                                                </span>

                                                {/* Dots cho KTV khác */}
                                                {hasLeaves && !myLeave && !isSelected && !isBlocked && (
                                                    <div className="flex gap-0.5 mt-0.5">
                                                        {dayLeaves.filter(l => l.employeeId !== user?.id).slice(0, 3).map((leave, idx) => (
                                                            <div key={idx} className={`w-1 h-1 rounded-full ${STATUS_DOT_COLORS[leave.status] || 'bg-gray-300'}`} />
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {/* Icon check nếu mình đã off */}
                                                {myLeave && !isSelected && !isBlocked && (
                                                    <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                                                        {myLeave.status === 'APPROVED' ? <CheckCircle2 size={10} className="text-emerald-500" /> : 
                                                         myLeave.status === 'PENDING' ? <Clock size={10} className="text-amber-500" /> : 
                                                         <XCircle size={10} className="text-red-500" />}
                                                    </div>
                                                )}

                                                {/* Lock icon cho ngày lễ */}
                                                {isBlocked && (
                                                    <div className="absolute -bottom-1 -right-1 bg-gray-100 rounded-full p-0.5 text-gray-400">
                                                        <Lock size={10} />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                
                                <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-gray-100 flex-wrap">
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[10px] text-gray-500 font-medium">Đã duyệt</span></div>
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-[10px] text-gray-500 font-medium">Chờ duyệt</span></div>
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500" /><span className="text-[10px] text-gray-500 font-medium">Đang chọn</span></div>
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-[10px] text-gray-500 font-medium">Từ chối</span></div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ── REGISTRATION ACTIONS ── */}
                {selectedDates.length > 0 && (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-lg p-5 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-rose-100 text-rose-600 p-2 rounded-xl">
                                <CalendarOff size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-sm">Đăng ký nghỉ OFF</h3>
                                <p className="text-xs text-gray-500">Đã chọn {selectedDates.length} ngày</p>
                            </div>
                        </div>

                        {offError && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2 flex items-center gap-2">
                                <AlertCircle size={14} className="shrink-0" />
                                <span>{offError}</span>
                                <button onClick={() => setOffError(null)} className="ml-auto"><XCircle size={14} /></button>
                            </div>
                        )}

                        {offSuccess && (
                            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl px-3 py-2 flex items-center gap-2">
                                <CheckCircle2 size={14} className="shrink-0" />
                                <span>Gửi đăng ký thành công!</span>
                            </div>
                        )}

                        <button
                            onClick={handleSubmitOff}
                            disabled={isSubmittingOff}
                            className="w-full py-3.5 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-md shadow-rose-200"
                        >
                            {isSubmittingOff ? (
                                <><Loader2 size={18} className="animate-spin" /> {t.submitting}</>
                            ) : (
                                <><Send size={18} /> Gửi yêu cầu nghỉ</>
                            )}
                        </button>
                    </div>
                )}

                {/* ── DETAILS ── */}
                {sortedDisplayDates.length > 0 && (
                    <div className="space-y-3">
                        {sortedDisplayDates.map(date => {
                            const leaves = leaveByDate[date] || [];
                            const formattedDate = (() => {
                                try { return format(new Date(date + 'T00:00:00'), 'EEEE, dd/MM/yyyy', { locale: vi }); }
                                catch { return date; }
                            })();

                            return (
                                <div key={date} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in">
                                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                                        <p className="text-xs font-bold text-gray-700 uppercase">{formattedDate}</p>
                                    </div>
                                    <div className="p-4">
                                        {leaves.length === 0 ? (
                                            <p className="text-xs text-gray-400 text-center py-2">Không có nhân sự nào OFF</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {leaves.map(leave => {
                                                    const cfg = STATUS_COLORS[leave.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.PENDING;
                                                    const Icon = cfg.icon;
                                                    return (
                                                        <div key={leave.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${cfg.border} ${cfg.bg}`}>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-bold text-sm text-gray-900 truncate">
                                                                    {leave.employeeName} {leave.employeeId === user?.id ? '(Bạn)' : ''}
                                                                </p>
                                                            </div>
                                                            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.text} ${cfg.bg}`}>
                                                                <Icon size={12} />
                                                                <span>{STATUS_LABELS[leave.status] || leave.status}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppLayout>
    );
};

export default KTVSchedulePage;
