'use client';

// 🔧 UI CONFIGURATION
const START_HOUR = 8;   // Giờ bắt đầu hiển thị
const END_HOUR = 24;    // Giờ kết thúc hiển thị (24:00 = nửa đêm)
const PIXELS_PER_MINUTE = 2;  // Mỗi phút = 2px chiều cao
const CARD_MIN_HEIGHT = 40;   // Chiều cao tối thiểu cho booking card (px)

import React, { useMemo, useRef } from 'react';
import { WebBooking } from './actions';

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  NEW:         { border: 'border-l-orange-400', bg: 'bg-orange-50',  badge: 'bg-orange-100 text-orange-700', badgeText: '⏳ Chờ' },
  PENDING:     { border: 'border-l-blue-400',   bg: 'bg-blue-50',    badge: 'bg-blue-100 text-blue-700',   badgeText: '🕒 Xác nhận' },
  PREPARING:   { border: 'border-l-violet-400', bg: 'bg-violet-50',  badge: 'bg-violet-100 text-violet-700', badgeText: '⚡ Chuẩn bị' },
  IN_PROGRESS: { border: 'border-l-emerald-400',bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700', badgeText: '▶ Đang làm' },
  COMPLETED:   { border: 'border-l-purple-400', bg: 'bg-purple-50',  badge: 'bg-purple-100 text-purple-700', badgeText: '🧹 Dọn' },
  DONE:        { border: 'border-l-gray-300',   bg: 'bg-gray-50',    badge: 'bg-gray-100 text-gray-500',  badgeText: '✓ Xong' },
  FEEDBACK:    { border: 'border-l-gray-300',   bg: 'bg-gray-50',    badge: 'bg-gray-100 text-gray-500',  badgeText: '⭐ Đánh giá' },
  CANCELLED:   { border: 'border-l-red-400',    bg: 'bg-red-50',     badge: 'bg-red-100 text-red-700',    badgeText: '✕ Hủy' },
} as const;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Parse "HH:mm" → total minutes from 00:00 */
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Get YYYY-MM-DD from a date */
const toDateKey = (d: Date): string => d.toISOString().split('T')[0];

/** Get bookingDate as YYYY-MM-DD */
const getBookingDateKey = (booking: WebBooking): string => {
  // bookingDate can be "2026-03-28 02:30:00" or ISO
  return booking.bookingDate.substring(0, 10);
};

/** Get week days array starting from Monday */
const getWeekDays = (weekStart: Date): Date[] => {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
};

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DAY_LABELS_FULL = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface WebBookingCalendarProps {
  bookings: WebBooking[];
  weekStart: Date;  // Monday of the displayed week
  onCardClick: (booking: WebBooking) => void;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

const WebBookingCalendar = ({ bookings, weekStart, onCardClick }: WebBookingCalendarProps) => {
  const today = toDateKey(new Date());
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const totalHeight = totalMinutes * PIXELS_PER_MINUTE;
  const weekDays = getWeekDays(weekStart);

  // Current time line position
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60;
  const nowTop = nowMinutes * PIXELS_PER_MINUTE;
  const isNowVisible = nowMinutes >= 0 && nowMinutes <= totalMinutes;

  // Group bookings by date
  const bookingsByDate = useMemo(() => {
    const grouped: Record<string, WebBooking[]> = {};
    for (const b of bookings) {
      if (b.status === 'CANCELLED') continue; // hide cancelled on calendar
      const dateKey = getBookingDateKey(b);
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(b);
    }
    return grouped;
  }, [bookings]);

  // Generate hour grid labels
  const hourLabels = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  const formatDayHeader = (d: Date, shortLabel: string, fullLabel: string) => {
    const dateKey = toDateKey(d);
    const isToday = dateKey === today;
    return (
      <div key={dateKey} className="flex-1 min-w-0 border-r border-gray-100 last:border-r-0">
        <div className={`flex flex-col items-center py-3 ${isToday ? 'bg-blue-50' : ''}`}>
          <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isToday ? 'text-blue-500' : 'text-gray-400'}`}>
            {shortLabel}
          </span>
          <span className={`text-lg font-black leading-none ${isToday ? 'text-blue-600 bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-base' : 'text-gray-800'}`}>
            {d.getDate()}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white rounded-2xl border border-gray-200">
      {/* Day headers */}
      <div className="flex border-b border-gray-200 shrink-0">
        {/* GMT+7 label */}
        <div className="w-16 shrink-0 p-3 border-r border-gray-100">
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">GMT+7</span>
        </div>

        {weekDays.map((d, i) => formatDayHeader(d, DAY_LABELS[i], DAY_LABELS_FULL[i]))}
      </div>

      {/* Scrollable calendar body */}
      <div className="flex flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {/* Hour labels */}
        <div className="w-16 shrink-0 border-r border-gray-100 relative bg-white z-10" style={{ height: totalHeight }}>
          {hourLabels.map((h) => {
            const top = (h - START_HOUR) * 60 * PIXELS_PER_MINUTE;
            return (
              <div
                key={h}
                className="absolute w-full text-right pr-3 text-[11px] text-gray-400 font-medium"
                style={{ top: top - 8 }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        <div className="flex flex-1 relative" style={{ height: totalHeight }}>
          {/* Horizontal hour grid lines */}
          {hourLabels.map((h) => {
            const top = (h - START_HOUR) * 60 * PIXELS_PER_MINUTE;
            return (
              <div
                key={h}
                className="absolute w-full border-t border-gray-100 pointer-events-none"
                style={{ top, zIndex: 0 }}
              />
            );
          })}

          {/* Current time line */}
          {isNowVisible && (
            <div
              className="absolute w-full pointer-events-none z-20"
              style={{ top: nowTop }}
            >
              <div className="relative flex items-center">
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full -ml-1.5 shrink-0 shadow-md" />
                <div className="flex-1 border-t-2 border-blue-400" />
              </div>
              {/* Time label */}
              <div className="absolute -left-16 -top-2.5 w-14 text-right">
                <span className="text-[10px] font-black text-blue-500">
                  {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
                </span>
              </div>
            </div>
          )}

          {/* Day columns with bookings */}
          {weekDays.map((d, idx) => {
            const dateKey = toDateKey(d);
            const isToday = dateKey === today;
            const dayBookings = bookingsByDate[dateKey] ?? [];

            return (
              <div
                key={dateKey}
                className={`flex-1 min-w-0 border-r border-gray-100 last:border-r-0 relative ${isToday ? 'bg-blue-50/20' : ''}`}
              >
                {dayBookings.map((booking) => {
                  const timeStr = booking.timeBooking ?? '09:00';
                  const startMins = timeToMinutes(timeStr) - START_HOUR * 60;
                  // Duration: sum of all items, or default 60
                  const duration = booking.items.reduce((s, i) => s + i.duration, 0) || 60;

                  const top = Math.max(0, startMins * PIXELS_PER_MINUTE);
                  const height = Math.max(CARD_MIN_HEIGHT, duration * PIXELS_PER_MINUTE);

                  if (startMins < 0 || startMins > totalMinutes) return null; // Outside visible range

                  const style = STATUS_STYLE[booking.status] ?? STATUS_STYLE.NEW;

                  return (
                    <div
                      key={booking.id}
                      onClick={() => onCardClick(booking)}
                      className={`absolute left-[4%] w-[92%] ${style.bg} border border-gray-100 border-l-4 ${style.border} rounded-lg cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all overflow-hidden p-2 z-10`}
                      style={{ top, height }}
                    >
                      {/* Time */}
                      <p className="text-[10px] text-gray-500 font-medium leading-none mb-1">
                        {timeStr}
                      </p>
                      {/* Customer name */}
                      <p className="text-[11px] font-black text-gray-800 leading-tight truncate">
                        {booking.customerName}
                      </p>
                      {/* Service list — show when card is tall enough */}
                      {height > 55 && booking.items.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {booking.items.slice(0, 2).map((item) => (
                            <p key={item.id} className="text-[10px] text-gray-500 leading-tight truncate">
                              · {item.serviceName}
                              {item.duration ? ` (${item.duration}p)` : ''}
                            </p>
                          ))}
                          {booking.items.length > 2 && (
                            <p className="text-[9px] text-gray-400 italic">+{booking.items.length - 2} dịch vụ</p>
                          )}
                        </div>
                      )}
                      {/* Status badge — show when enough space */}
                      {height > 90 && (
                        <div className={`mt-1.5 ${style.badge} text-[9px] font-bold px-1.5 py-0.5 rounded w-fit`}>
                          {style.badgeText}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WebBookingCalendar;
