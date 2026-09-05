'use client';

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChevronLeft, ChevronRight, Search, RefreshCw, Timer, Lock, ClipboardCheck } from 'lucide-react';
import { useAdminKtvHoursLogic, fmtHours, fmtShortDate, HoursRow } from './AdminKtvHours.logic';

// 🔧 UI CONFIGURATION — cùng bảng màu với trang Chấm điểm Office.
const CSS_VARS = {
  '--bg': '#f4f1e9',
  '--surface': '#ffffff',
  '--surface-soft': '#f8f7f2',
  '--ink': '#1f2b23',
  '--muted': '#748074',
  '--line': '#e4e0d5',
  '--green': '#355b43',
  '--green-2': '#e7efe8',
  '--rust': '#a6533d',
  '--rust-2': '#f8ece7',
  '--amber': '#9a6a20',
  '--amber-2': '#fbf1dc',
  '--radius': '22px',
} as React.CSSProperties;

/** Màu huy chương cho 3 hạng đầu; từ hạng 4 dùng màu trung tính. */
const MEDALS: Record<number, { bg: string; ink: string; label: string }> = {
  1: { bg: '#f3e2b3', ink: '#7a5a10', label: 'Hạng 1' },
  2: { bg: '#e3e5e8', ink: '#5b6169', label: 'Hạng 2' },
  3: { bg: '#eddac9', ink: '#8a5230', label: 'Hạng 3' },
};

const Avatar = ({ row, size = 44 }: { row: HoursRow; size?: number }) => (
  <div
    style={{ width: size, height: size }}
    className="rounded-full bg-[var(--green-2)] text-[var(--green)] font-bold flex items-center justify-center overflow-hidden shrink-0"
  >
    {row.avatarUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={row.avatarUrl} alt={row.name} className="w-full h-full object-cover" />
      : <span style={{ fontSize: size * 0.38 }}>{row.name.charAt(0).toUpperCase()}</span>}
  </div>
);

const StatCard = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="bg-[var(--surface)] rounded-2xl p-4 shadow-sm">
    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{label}</p>
    <p className="text-xl md:text-2xl font-bold mt-1 tabular-nums">{value}</p>
    {hint && <p className="text-[11px] text-[var(--muted)] mt-0.5">{hint}</p>}
  </div>
);

const AdminKtvHoursPage = () => {
  const logic = useAdminKtvHoursLogic();
  const { totals, maxValue, sort } = logic;

  const sortLabel = sort === 'earned' ? 'giờ làm thực' : 'giờ thực nhận';

  // Bục chỉ có nghĩa khi cả 3 hạng đầu đều CÓ giờ. Đầu tháng gần như ai cũng 0h,
  // lúc đó bục chỉ tôn vinh thứ tự tên gọi chứ không phải thành tích.
  const top3 = logic.ranked.slice(0, 3);
  const podium = !logic.searchQuery.trim() && top3.length === 3 && top3.every(r => r[sort] > 0)
    ? top3
    : [];

  return (
    <AppLayout title="Giờ Tích Lũy KTV">
      <div style={CSS_VARS} className="min-h-screen bg-[var(--bg)] text-[var(--ink)] font-sans pb-24">
        <main className="max-w-5xl mx-auto p-5 md:p-8">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-6">
            <div>
              <p className="text-[var(--green)] font-bold text-xs tracking-widest uppercase mb-1">Kỹ thuật viên loại D</p>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
                <Timer size={30} className="text-[var(--green)]" /> Giờ tích lũy
              </h1>
              <p className="text-sm text-[var(--muted)] mt-2 max-w-xl leading-relaxed">
                Xếp hạng theo <b className="text-[var(--ink)]">thời gian làm thực trong dịch vụ</b> — cộng từ sổ giờ
                mỗi tua, đã loại các dịch vụ tiện ích.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/admin/ktv-office"
                className="h-11 px-4 rounded-2xl bg-[var(--surface)] shadow-sm font-bold text-sm flex items-center gap-2 hover:bg-[var(--green-2)]"
              ><ClipboardCheck size={16} /> Chấm điểm</Link>
              <button
                onClick={logic.refresh}
                title="Tải lại"
                className="w-11 h-11 rounded-2xl bg-[var(--surface)] shadow-sm flex items-center justify-center hover:bg-[var(--green-2)]"
              ><RefreshCw size={17} className={logic.loading ? 'animate-spin' : ''} /></button>
            </div>
          </div>

          {/* Kỳ xem — quy chế loại D tính giờ theo TỪNG THÁNG nên chỉ xem theo tháng. */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center bg-[var(--surface)] p-1 rounded-2xl shadow-sm">
              <button onClick={() => logic.changeMonth(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[var(--green-2)]"><ChevronLeft size={19} /></button>
              <span className="min-w-[104px] text-center font-bold text-sm">Tháng {logic.month}</span>
              <button
                onClick={() => logic.changeMonth(1)}
                disabled={!logic.canGoNext}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[var(--green-2)] disabled:opacity-30 disabled:hover:bg-transparent"
              ><ChevronRight size={19} /></button>
            </div>
          </div>

          {/* Tổng quan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Tổng giờ làm thực" value={fmtHours(totals.earned)} hint={`${totals.active}/${totals.staff} KTV có giờ`} />
            <StatCard label="Trung bình mỗi KTV" value={fmtHours(totals.avg)} hint="Chỉ tính người có giờ" />
            <StatCard label="Tổng số tua" value={totals.turns.toLocaleString('vi-VN')} hint="Tua có phát sinh giờ" />
            <StatCard label="Giờ bị trừ" value={fmtHours(totals.penalty)} hint="Phạt kỷ luật" />
          </div>

          {/* Tìm kiếm + tiêu chí xếp hạng */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="flex-1 flex items-center gap-3 px-4 h-14 bg-[var(--surface)] rounded-2xl shadow-sm">
              <Search size={20} className="text-[var(--muted)]" />
              <input
                type="search"
                placeholder="Tìm tên hoặc mã KTV"
                className="w-full bg-transparent border-none focus:outline-none text-[var(--ink)]"
                value={logic.searchQuery}
                onChange={e => logic.setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center bg-[var(--surface)] p-1 rounded-2xl shadow-sm">
              {([
                { id: 'earned', label: 'Giờ làm thực' },
                { id: 'net', label: 'Giờ thực nhận' },
              ] as const).map(o => (
                <button
                  key={o.id}
                  onClick={() => logic.setSort(o.id)}
                  title={o.id === 'earned'
                    ? 'Tổng giờ đã làm trong dịch vụ, chưa trừ phạt'
                    : 'Sau khi trừ giờ phạt — khớp thứ tự nhận tua ở bảng điều phối'}
                  className={`h-12 px-4 rounded-xl text-sm font-bold transition-colors ${
                    sort === o.id ? 'bg-[var(--green)] text-white' : 'text-[var(--muted)] hover:bg-[var(--green-2)]'
                  }`}
                >{o.label}</button>
              ))}
            </div>
          </div>

          {logic.loading && (
            <p className="py-16 text-center text-[var(--muted)]">Đang tính giờ tích lũy…</p>
          )}

          {!logic.loading && logic.loadError && (
            <div className="bg-[var(--rust-2)] text-[var(--rust)] p-5 rounded-2xl flex items-center justify-between gap-4 flex-wrap">
              <span className="font-bold text-sm">{logic.loadError}</span>
              <button onClick={logic.refresh} className="h-10 px-4 rounded-xl font-bold bg-[var(--green)] text-white">Thử lại</button>
            </div>
          )}

          {!logic.loading && !logic.loadError && logic.rows.length === 0 && (
            <p className="py-16 text-center text-[var(--muted)]">
              {logic.searchQuery ? 'Không tìm thấy KTV nào khớp.' : 'Chưa có dữ liệu giờ trong kỳ này.'}
            </p>
          )}

          {!logic.loading && !logic.loadError && logic.rows.length > 0 && (
            <>
              {/* Bục 3 hạng đầu */}
              {podium.length === 3 && (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[podium[1], podium[0], podium[2]].map(r => {
                    const medal = MEDALS[r.rank];
                    const isTop = r.rank === 1;
                    return (
                      <div
                        key={r.id}
                        className={`bg-[var(--surface)] rounded-[var(--radius)] p-4 text-center shadow-sm flex flex-col items-center ${isTop ? 'md:-mt-4 ring-2 ring-[var(--green)]' : ''}`}
                      >
                        <span
                          style={{ background: medal.bg, color: medal.ink }}
                          className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-3"
                        >{medal.label}</span>
                        <Avatar row={r} size={isTop ? 64 : 52} />
                        <p className="font-bold mt-2 text-sm leading-tight line-clamp-2">{r.name}</p>
                        <p className="text-[11px] text-[var(--muted)]">{r.code}</p>
                        <p className={`font-bold tabular-nums mt-2 ${isTop ? 'text-2xl text-[var(--green)]' : 'text-lg'}`}>
                          {fmtHours(r[sort])}
                        </p>
                        <p className="text-[11px] text-[var(--muted)]">{r.turns} tua · {r.days} ngày</p>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)] mb-2">
                Xếp theo {sortLabel} · {logic.rows.length} KTV
              </p>

              <div className="space-y-2">
                {logic.rows.map(r => {
                  const value = r[sort];
                  const pct = maxValue > 0 ? Math.max(0, (value / maxValue) * 100) : 0;
                  const medal = MEDALS[r.rank];
                  return (
                    <div key={r.id} className="bg-[var(--surface)] rounded-2xl p-4 shadow-sm flex items-center gap-3 md:gap-4">
                      <div
                        style={medal ? { background: medal.bg, color: medal.ink } : undefined}
                        className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center font-bold text-sm tabular-nums ${medal ? '' : 'bg-[var(--surface-soft)] text-[var(--muted)]'}`}
                      >{r.rank}</div>

                      <Avatar row={r} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold truncate">{r.name}</p>
                          <span className="text-[11px] text-[var(--muted)]">{r.code}</span>
                          {r.locked && (
                            <span className="text-[10px] font-bold text-[var(--rust)] bg-[var(--rust-2)] px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Lock size={10} /> Đang khóa
                            </span>
                          )}
                        </div>

                        {/* Thanh tỉ lệ so với người dẫn đầu */}
                        <div className="h-1.5 bg-[var(--surface-soft)] rounded-full mt-2 overflow-hidden">
                          <div
                            style={{ width: `${pct}%` }}
                            className={`h-full rounded-full ${value < 0 ? 'bg-[var(--rust)]' : 'bg-[var(--green)]'}`}
                          />
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)] mt-1.5">
                          <span>{r.turns} tua</span>
                          <span>{r.days} ngày</span>
                          <span>TB {fmtHours(r.avgPerDay)}/ngày</span>
                          {r.penalty > 0 && (
                            <span className="text-[var(--rust)] font-bold">− {fmtHours(r.penalty)} phạt</span>
                          )}
                          <span>Gần nhất {fmtShortDate(r.lastDate)}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-lg md:text-xl font-bold tabular-nums leading-tight">{fmtHours(value)}</p>
                        <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest">
                          {sort === 'earned' ? 'làm thực' : 'thực nhận'}
                        </p>
                        {sort === 'earned' && r.penalty > 0 && (
                          <p className="text-[11px] text-[var(--muted)]">Còn {fmtHours(r.net)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-[var(--muted)] leading-relaxed mt-6 bg-[var(--surface-soft)] p-4 rounded-2xl">
                <b className="text-[var(--ink)]">Giờ làm thực</b> là tổng thời gian đã phục vụ trong dịch vụ, chưa trừ phạt.{' '}
                <b className="text-[var(--ink)]">Giờ thực nhận</b> là giờ làm thực trừ đi giờ phạt kỷ luật — đây mới là con số
                quyết định thứ tự nhận tua ở bảng điều phối. Số liệu lấy thẳng từ sổ giờ tua, cập nhật ngay khi KTV
                kết thúc đơn — không phải chờ chốt sổ cuối ngày.
              </p>
            </>
          )}
        </main>
      </div>
    </AppLayout>
  );
};

export default AdminKtvHoursPage;
