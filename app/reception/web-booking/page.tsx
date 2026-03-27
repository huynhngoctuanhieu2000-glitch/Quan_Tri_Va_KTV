'use client';

// 🔧 UI CONFIGURATION
const WEEK_DAYS_COUNT = 7;          // Số ngày hiển thị trong Calendar view
const AUTO_REFRESH_INTERVAL_MS = 0; // 0 = tắt auto-refresh (dùng realtime thay thế)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { AnimatePresence, motion } from 'motion/react';
import {
  ShieldAlert, List, CalendarDays, ChevronLeft, ChevronRight,
  RefreshCw, Bell, CheckCircle2, Clock, Globe2,
} from 'lucide-react';
import { useNotifications } from '@/components/NotificationProvider';

import {
  getWebBookings,
  confirmWebBooking,
  rejectWebBooking,
  type WebBooking,
} from './actions';
import WebBookingCard from './WebBookingCard';
import WebBookingDetailPanel from './WebBookingDetailPanel';
import WebBookingCalendar from './WebBookingCalendar';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Get Monday of the week containing the given date */
const getMondayOfWeek = (d: Date): Date => {
  const monday = new Date(d);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

/** Get YYYY-MM-DD */
const toDateKey = (d: Date) => d.toISOString().split('T')[0];

/** Format "Tuần dd/MM – dd/MM/yyyy" */
const formatWeekRange = (monday: Date): string => {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(monday)} – ${fmt(sunday)}/${sunday.getFullYear()}`;
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function WebBookingPage() {
  const { hasPermission } = useAuth();
  const { unlockAudio, playSound } = useNotifications();
  const [mounted, setMounted] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'list' | 'calendar'>('list');

  // Week navigation (for calendar)
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOfWeek(new Date()));

  // Data state
  const [bookings, setBookings] = useState<WebBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Detail panel
  const [selectedBooking, setSelectedBooking] = useState<WebBooking | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const fetchBookings = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch 2 weeks range (current + next) for calendar, plus past 3 days for list
      const from = new Date(weekStart);
      from.setDate(from.getDate() - 3); // 3 ngày trước

      const to = new Date(weekStart);
      to.setDate(to.getDate() + 14); // 2 tuần tới

      const res = await getWebBookings(toDateKey(from), toDateKey(to));
      if (res.success) {
        setBookings(res.data);
      }
    } catch (err) {
      console.error('[WebBooking] fetchBookings error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [weekStart]);

  // ─── Realtime ─────────────────────────────────────────────────────────────

  useEffect(() => {
    setMounted(true);
    fetchBookings();

    const channel = supabase
      .channel('web_booking_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Bookings' },
        (payload: any) => {
          const newBooking = payload.new;
          // Only handle web bookings (billCode starting with WB)
          if (newBooking?.status === 'NEW' && String(newBooking?.billCode || '').startsWith('WB')) {
            console.log('📩 [WebBooking] New booking received:', newBooking.billCode);
            playSound?.('new_booking');
            showToast(`📩 Đơn mới: ${newBooking.billCode} — ${newBooking.customerName}!`, 'success');
            fetchBookings(); // Re-fetch to get full data with BookingItems
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'Bookings' },
        () => {
          fetchBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [weekStart]); // Re-subscribe when week changes

  if (!mounted) return null;

  // ─── Permission check ──────────────────────────────────────────────────────

  if (!hasPermission('order_management')) {
    return (
      <AppLayout title="Đơn Đặt Lịch Web">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
          <p className="text-sm text-gray-500 mt-1">Bạn cần quyền &quot;order_management&quot; để xem trang này.</p>
        </div>
      </AppLayout>
    );
  }

  // ─── Derived state ─────────────────────────────────────────────────────────

  const newBookings = bookings.filter((b) => b.status === 'NEW');
  const allListBookings = bookings.filter((b) => b.status !== 'CANCELLED');

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleConfirm = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await confirmWebBooking(id);
      if (res.success) {
        showToast('✅ Đã xác nhận! Đơn đã chuyển sang bảng Điều phối.', 'success');
        setSelectedBooking(null);
        setBookings((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: 'PENDING' } : b))
        );
      } else {
        showToast('❌ Lỗi: ' + res.error, 'error');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await rejectWebBooking(id);
      if (res.success) {
        showToast('Đã từ chối đơn này.', 'success');
        setSelectedBooking(null);
        setBookings((prev) => prev.filter((b) => b.id !== id));
      } else {
        showToast('❌ Lỗi: ' + res.error, 'error');
      }
    } finally {
      setProcessingId(null);
    }
  };

  // ─── Week navigation ──────────────────────────────────────────────────────

  const prevWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const nextWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const goToThisWeek = () => setWeekStart(getMondayOfWeek(new Date()));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Đơn Đặt Lịch Web">
      <div className="h-[calc(100vh-1rem)] lg:h-[calc(100vh-3rem)] flex flex-col overflow-hidden">

        {/* ── Page Header ── */}
        <div className="shrink-0 mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Title */}
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Globe2 size={20} className="text-indigo-500" />
              Đơn Đặt Lịch Web Booking
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {isLoading ? (
                <span className="flex items-center gap-1">
                  <RefreshCw size={10} className="animate-spin" /> Đang tải...
                </span>
              ) : (
                <>
                  <span className="text-orange-600 font-bold">{newBookings.length} đơn mới</span>
                  {' · '}
                  <span className="text-gray-400">{allListBookings.length} tổng cộng</span>
                </>
              )}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Tab Switcher */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
              <button
                onClick={() => setActiveTab('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List size={13} />
                Danh sách
                {newBookings.length > 0 && (
                  <span className="bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {newBookings.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'calendar'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CalendarDays size={13} />
                Lịch tuần
              </button>
            </div>

            {/* Week navigation — only visible in calendar tab */}
            {activeTab === 'calendar' && (
              <div className="flex items-center gap-1 border border-gray-200 rounded-xl px-2 py-1 bg-white">
                <button onClick={prevWeek} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={goToThisWeek}
                  className="px-2 text-xs font-bold text-gray-700 hover:text-indigo-600 transition-colors whitespace-nowrap"
                >
                  {formatWeekRange(weekStart)}
                </button>
                <button onClick={nextWeek} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Refresh */}
            <button
              onClick={fetchBookings}
              disabled={isLoading}
              className="p-2 border border-gray-200 rounded-xl text-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-40"
              title="Làm mới dữ liệu"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'list' ? (
              /* ── LIST VIEW ── */
              <motion.div
                key="list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="h-full overflow-y-auto pr-1"
                style={{ scrollbarWidth: 'thin' }}
              >
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                    <RefreshCw size={28} className="animate-spin" />
                    <p className="text-sm font-medium">Đang tải dữ liệu...</p>
                  </div>
                ) : newBookings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-300">
                    <div className="w-16 h-16 rounded-3xl bg-gray-50 flex items-center justify-center">
                      <CheckCircle2 size={32} className="opacity-30" />
                    </div>
                    <div className="text-center">
                      <p className="font-black text-gray-400">Không có đơn mới</p>
                      <p className="text-sm text-gray-300 mt-1">Tất cả đơn đặt lịch đã được xử lý</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-6">
                    <AnimatePresence>
                      {newBookings.map((booking) => (
                        <WebBookingCard
                          key={booking.id}
                          booking={booking}
                          onConfirm={handleConfirm}
                          onReject={handleReject}
                          onViewDetail={setSelectedBooking}
                          isLoading={processingId === booking.id}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            ) : (
              /* ── CALENDAR VIEW ── */
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <WebBookingCalendar
                  bookings={allListBookings}
                  weekStart={weekStart}
                  onCardClick={setSelectedBooking}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Detail Panel ── */}
        <WebBookingDetailPanel
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onConfirm={handleConfirm}
          onReject={handleReject}
          isLoading={processingId === selectedBooking?.id}
        />

        {/* ── Toast Notification ── */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-2 max-w-sm ${
                toast.type === 'success'
                  ? 'bg-gray-900 text-white'
                  : 'bg-red-600 text-white'
              }`}
            >
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </AppLayout>
  );
}
