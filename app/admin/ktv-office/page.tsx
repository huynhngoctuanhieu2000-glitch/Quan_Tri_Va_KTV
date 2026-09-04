'use client';

import React from 'react';
import { useAdminKtvOfficeLogic } from './AdminKtvOffice.logic';
import { Search, ChevronLeft, ChevronRight, X, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppLayout } from '@/components/layout/AppLayout';

// 🔧 UI CONFIGURATION
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
  '--shadow': '0 14px 42px rgba(31, 43, 35, .10)',
  '--radius': '22px',
} as React.CSSProperties;

const VIOLATIONS = [
  { group: 'Quy trình công việc', max: 40, items: [
    { name: 'Trước tua', desc: 'Khi đã có đơn hàng', points: 5 },
    { name: 'Nhận tua và đón khách', desc: 'Tại khu vực sảnh', points: 5 },
    { name: 'Trong dịch vụ', desc: 'Không tuân thủ quy trình', points: 10 },
    { name: 'Kết thúc dịch vụ', desc: 'Bàn giao khách', points: 5 },
    { name: 'Sau dịch vụ — tại sảnh', desc: 'Thiếu bước chăm sóc sau dịch vụ', points: 5 },
    { name: 'Sau dịch vụ — tại phòng', desc: 'Phòng hoặc bàn giao chưa đạt', points: 10 }
  ]},
  { group: 'Thời gian làm việc', max: 30, items: [
    { name: 'Bật app không đúng giờ', desc: 'So với lịch đã đăng ký', points: 7.5 },
    { name: 'Rời vị trí khi đang trong ca', desc: 'Không có xác nhận của quản lý', points: 10 },
    { name: 'Kết thúc ca sớm', desc: 'Không có lý do được duyệt', points: 5 }
  ]}
];

const AdminKtvOfficePage = () => {
  const logic = useAdminKtvOfficeLogic();
  
  // Phân loại KTV và tìm kiếm
  const filteredStaff = logic.staffList.filter(ktv => 
    ktv.name.toLowerCase().includes(logic.searchQuery.toLowerCase()) || 
    ktv.code.toLowerCase().includes(logic.searchQuery.toLowerCase())
  );
  const attentionList = filteredStaff.filter(ktv => ktv.locked || ktv.score < 90);
  const activeList = filteredStaff.filter(ktv => !ktv.locked && ktv.score >= 90);

  const fmtMoney = (n: number) => n.toLocaleString('vi-VN') + ' ₫';
  const fmtNum = (n: number) => Number(n ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  const fmtDate = (iso: string) => {
    try { return new Date(iso + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }); }
    catch { return iso; }
  };
  /** Giờ thập phân → "18h 30P" cho dễ đọc, khớp với bảng điều phối. */
  const fmtHours = (h: number) => {
    const total = Number(h) || 0;
    const sign = total < 0 ? '−' : '';
    const abs = Math.abs(total);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${sign}${hh}h ${String(mm).padStart(2, '0')}P`;
  };

  return (
    <AppLayout title="Chấm Điểm Office">
      <div style={CSS_VARS} className="min-h-screen bg-[var(--bg)] text-[var(--ink)] font-sans pb-24">
      {/* CSS in JS fallback for specific styling needs */}
      <style dangerouslySetInnerHTML={{__html: `
        .person-card { background: var(--surface); border-radius: var(--radius); padding: 18px; box-shadow: 0 4px 18px rgba(31,43,35,.06); position: relative; }
        .person-card.attention { border-left: 4px solid var(--rust); }
        .btn-primary { background: var(--green); color: #fff; }
        .btn-primary:hover { background: #294c37; }
        .btn-danger { background: var(--rust-2); color: var(--rust); }
        .btn-ghost { color: var(--green); }
        .btn-ghost:hover { background: var(--green-2); }
      `}} />

      <main className="max-w-5xl mx-auto p-5 md:p-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-[var(--green)] font-bold text-xs tracking-widest uppercase mb-1">Kỹ thuật viên loại D</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Chấm điểm KTV</h1>
            <div className="flex items-center gap-4 mt-3 text-[var(--muted)] text-sm">
              <span className="flex items-center gap-2"><i className="w-2 h-2 rounded-full bg-[var(--green)]"></i><b className="text-[var(--ink)]">{activeList.length}</b> đang hoạt động</span>
              <span className="flex items-center gap-2"><i className="w-2 h-2 rounded-full bg-[var(--rust)]"></i><b className="text-[var(--ink)]">{attentionList.length}</b> cần xử lý</span>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center bg-[var(--surface)] p-1 rounded-2xl shadow-sm">
              <button onClick={() => logic.changeMonth(-1)} className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-xl"><ChevronLeft size={20}/></button>
              <span className="min-w-[100px] text-center font-bold text-sm">Tháng {logic.month}</span>
              <button onClick={() => logic.changeMonth(1)} className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-xl"><ChevronRight size={20}/></button>
            </div>
          </div>
        </div>

        {/* Tools Section */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
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
          <button onClick={logic.toggleFilter} className="h-14 px-6 font-bold bg-[var(--surface)] rounded-2xl shadow-sm">
            {logic.filterMode}
          </button>
        </div>

        {logic.loading && (
          <p className="py-16 text-center text-[var(--muted)]">Đang tải danh sách KTV…</p>
        )}

        {!logic.loading && logic.loadError && (
          <div className="bg-[var(--rust-2)] text-[var(--rust)] p-5 rounded-2xl flex items-center justify-between gap-4 flex-wrap">
            <span className="font-bold text-sm">{logic.loadError}</span>
            <button onClick={logic.refresh} className="h-10 px-4 rounded-xl font-bold btn-primary">Thử lại</button>
          </div>
        )}

        {!logic.loading && !logic.loadError && filteredStaff.length === 0 && (
          <p className="py-16 text-center text-[var(--muted)]">
            {logic.searchQuery ? 'Không tìm thấy KTV nào khớp.' : 'Chưa có KTV Loại D nào đang hoạt động.'}
          </p>
        )}

        {/* Cần xử lý */}
        {(logic.filterMode === 'Tất cả' || logic.filterMode === 'Cần xử lý') && attentionList.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-xs tracking-widest uppercase font-bold text-[var(--ink)]">Cần xử lý</h2>
              <span className="text-sm text-[var(--muted)]">{attentionList.length} KTV</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
              {attentionList.map(ktv => (
                <article key={ktv.code} className="person-card attention lg:flex lg:justify-between lg:items-center">
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[var(--green)] font-bold text-sm">{ktv.code}</span>
                        <h3 className="text-lg font-bold">{ktv.name}</h3>
                      </div>
                      {ktv.locked && <span className="px-3 py-1 rounded-full text-xs font-bold bg-[var(--rust-2)] text-[var(--rust)] lg:hidden">Đã khóa</span>}
                    </div>
                    <p className="text-[var(--rust)] text-sm mb-4">
                      {ktv.locked ? (ktv.lockReason || 'Tài khoản đang bị khóa') : 'Điểm tháng dưới 90'}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div><strong className="block text-xl">{fmtNum(ktv.score)} điểm</strong><span className="text-[var(--muted)] text-xs">Điểm tháng {logic.month} · {ktv.workDays} ngày làm</span></div>
                      <div><strong className="block text-xl">{fmtHours(ktv.hours)}</strong><span className="text-[var(--muted)] text-xs">Giờ tích lũy{ktv.rank ? ` · hạng ${ktv.rank}` : ''}</span></div>
                    </div>
                    {ktv.repeatPenalty > 0 && (
                      <p className="mt-3 inline-block text-xs font-bold text-[var(--amber)] bg-[var(--amber-2)] px-3 py-1.5 rounded-lg">
                        ↺ Lỗi lặp: {ktv.repeats.map((r: any) => `${r.label} ×${r.times}`).join(', ')} — trừ thêm {fmtNum(ktv.repeatPenalty)}đ
                      </p>
                    )}
                  </div>
                  {ktv.locked && <div className="hidden lg:block self-start"><span className="px-3 py-1 rounded-full text-xs font-bold bg-[var(--rust-2)] text-[var(--rust)]">Đã khóa</span></div>}
                  <div className="flex gap-2 mt-5 lg:mt-0 lg:flex-col lg:justify-center">
                    {ktv.locked && <button className="flex-1 lg:flex-none h-11 px-4 rounded-xl font-bold btn-primary" onClick={() => logic.openSheet('unlock', ktv.name, ktv.code)}>Mở khóa</button>}
                    <button className="flex-1 lg:flex-none h-11 px-4 rounded-xl font-bold btn-ghost" onClick={() => logic.openSheet('history', ktv.name, ktv.code)}>Lịch sử</button>
                    <button className="flex-1 lg:flex-none h-11 px-4 rounded-xl font-bold btn-ghost" onClick={() => logic.openSheet('deduct', ktv.name, ktv.code, ktv.score)}>Trừ điểm</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Đang hoạt động */}
        {(logic.filterMode === 'Tất cả' || logic.filterMode === 'Điểm thấp') && activeList.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-xs tracking-widest uppercase font-bold text-[var(--ink)]">Đang hoạt động</h2>
              <span className="text-sm text-[var(--muted)]">{activeList.length} KTV</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeList.map(ktv => (
                <article key={ktv.code} className="person-card flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[var(--green)] font-bold text-sm">{ktv.code}</span>
                      <h3 className="text-lg font-bold">{ktv.name}</h3>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-[var(--green-2)] text-[var(--green)] whitespace-nowrap">{ktv.status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div><strong className="block text-xl">{fmtNum(ktv.score)} điểm</strong><span className="text-[var(--muted)] text-xs">Điểm tháng {logic.month} · {ktv.workDays} ngày làm</span></div>
                    <div><strong className="block text-xl">{fmtHours(ktv.hours)}</strong><span className="text-[var(--muted)] text-xs">Giờ tích lũy{ktv.rank ? ` · hạng ${ktv.rank}` : ''}</span></div>
                  </div>
                  {ktv.repeatPenalty > 0 && (
                    <p className="mb-3 inline-block text-xs font-bold text-[var(--amber)] bg-[var(--amber-2)] px-3 py-1.5 rounded-lg">
                      ↺ Lỗi lặp: {ktv.repeats.map((r: any) => `${r.label} ×${r.times}`).join(', ')} — trừ thêm {fmtNum(ktv.repeatPenalty)}đ
                    </p>
                  )}
                  <div className="mt-auto pt-3 border-t border-[var(--line)] text-sm mb-4">
                    <span className="text-[var(--muted)]">Quỹ nội bộ phải đóng </span>
                    <strong className={ktv.fundDue === 0 ? 'text-[var(--green)]' : 'text-[var(--rust)]'}>{fmtMoney(ktv.fundDue)}</strong>
                    <span className="text-[var(--muted)]">{ktv.exemptPct > 0 ? ` (đã miễn ${ktv.exemptPct}%)` : ' — không được miễn'}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 h-11 px-4 rounded-xl font-bold btn-danger" onClick={() => logic.openSheet('deduct', ktv.name, ktv.code, ktv.score)}>Trừ điểm</button>
                    <button className="flex-1 h-11 px-4 rounded-xl font-bold btn-ghost" onClick={() => logic.openSheet('history', ktv.name, ktv.code)}>Lịch sử</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Bottom Sheet Overlay */}
      <AnimatePresence>
        {logic.sheetState.isOpen && (
          <div className="fixed inset-0 z-50 flex justify-center items-end md:items-center bg-black/40 backdrop-blur-sm p-0 md:p-6" onClick={(e) => {
            if (e.target === e.currentTarget) logic.closeSheet();
          }}>
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-[var(--surface)] w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-[26px] md:rounded-[26px] overflow-hidden shadow-2xl"
            >
              {/* Sheet Header */}
              <div className="p-5 border-b border-[var(--line)] flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">
                    {logic.sheetState.type === 'deduct' ? 'Trừ điểm' : 
                     logic.sheetState.type === 'unlock' ? 'Mở khóa tài khoản' : 'Lịch sử điểm'}
                  </h2>
                  <p className="text-sm text-[var(--muted)] mt-1">{logic.sheetState.code} · {logic.sheetState.person}</p>
                </div>
                <button onClick={logic.closeSheet} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100">
                  <X size={20} />
                </button>
              </div>

              {/* Sheet Body */}
              <div className="flex-1 overflow-y-auto p-5 pb-8">
                {logic.sheetState.type === 'deduct' && (
                  <>
                    <div className="flex justify-between items-center bg-[var(--surface-soft)] p-3.5 rounded-2xl mb-5">
                      <div>
                        <span className="block text-xs text-[var(--muted)]">Ngày vi phạm</span>
                        <strong className="text-sm">{logic.sheetState.date}</strong>
                      </div>
                      <button className="text-[var(--green)] font-bold text-sm">Thay đổi</button>
                    </div>

                    <div className="flex justify-between items-center bg-[var(--green-2)] p-4 rounded-2xl mb-6">
                      <div>
                        <span className="block text-xs text-[var(--muted)]">Điểm hiện tại</span>
                        <strong className="text-2xl tracking-tight">{logic.sheetState.score}</strong>
                      </div>
                      <div className="text-right">
                        <span className="block text-xs text-[var(--muted)]">Sau khi trừ</span>
                        <strong className="text-2xl tracking-tight">{Math.max(0, logic.sheetState.score - logic.sheetState.selectedViolations.reduce((a,b)=>a+b.points,0))}</strong>
                      </div>
                    </div>

                    {VIOLATIONS.map((group, gIdx) => (
                      <div key={gIdx} className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="text-xs font-bold uppercase tracking-widest">{group.group}</h3>
                          <span className="text-xs text-[var(--muted)]">Tối đa {group.max} điểm</span>
                        </div>
                        <div className="border-t border-[var(--line)]">
                          {group.items.map((item, iIdx) => {
                            const isChecked = logic.sheetState.selectedViolations.some(v => v.name === item.name);
                            return (
                              <label key={iIdx} className="flex items-center gap-3 py-3 border-b border-[var(--line)] cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="w-5 h-5 accent-[var(--rust)]"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      logic.setSheetState(prev => ({...prev, selectedViolations: [...prev.selectedViolations, {name: item.name, points: item.points}]}));
                                    } else {
                                      logic.setSheetState(prev => ({...prev, selectedViolations: prev.selectedViolations.filter(v => v.name !== item.name)}));
                                    }
                                  }}
                                />
                                <div className="flex-1">
                                  <strong className="block text-sm font-semibold">{item.name}</strong>
                                  <small className="block text-xs text-[var(--muted)] mt-0.5">{item.desc}</small>
                                </div>
                                <span className="font-bold text-[var(--rust)]">−{item.points}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {logic.sheetState.type === 'unlock' && (
                  <>
                    <div className="bg-[var(--rust-2)] text-[var(--rust)] p-4 rounded-2xl mb-5 text-sm">
                      <strong className="block mb-1">Lý do bị khóa</strong>
                      Không đăng ký lịch và không điểm danh ngày 04/09/2026<br/>
                      <span className="opacity-75 text-xs">Hệ thống tự khóa lúc 23:59</span>
                    </div>
                    <div className="mt-5">
                      <label className="block text-sm font-bold mb-2">Lý do mở khóa <span className="text-[var(--rust)]">*</span></label>
                      <textarea 
                        className="w-full min-h-[120px] p-4 rounded-2xl border border-[var(--line)] focus:outline-none focus:ring-2 focus:ring-[var(--green)]/20"
                        placeholder="Ví dụ: KTV đã bổ sung lịch làm việc và được quản lý xác nhận."
                      ></textarea>
                    </div>
                  </>
                )}

                {logic.sheetState.type === 'history' && (
                  <>
                    {logic.detailLoading && (
                      <p className="py-10 text-center text-[var(--muted)]">Đang tải dữ liệu…</p>
                    )}

                    {!logic.detailLoading && !logic.detail && (
                      <p className="py-10 text-center text-[var(--muted)]">Không tải được dữ liệu của KTV này.</p>
                    )}

                    {!logic.detailLoading && logic.detail && (() => {
                      const o = logic.detail.office;
                      const hrs = logic.detail.hours;
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-3 mb-5">
                            <div className="bg-[var(--surface-soft)] p-4 rounded-2xl">
                              <span className="block text-xs text-[var(--muted)]">Điểm tháng {logic.month}</span>
                              <strong className="text-lg">{fmtNum(o.score)} điểm</strong>
                            </div>
                            <div className="bg-[var(--surface-soft)] p-4 rounded-2xl">
                              <span className="block text-xs text-[var(--muted)]">Giờ tích lũy</span>
                              <strong className="text-lg">{fmtHours(hrs.total)}</strong>
                            </div>
                          </div>

                          <div className="flex gap-1 border-b border-[var(--line)] mb-5">
                            <button
                              onClick={() => logic.setHistoryTab('office')}
                              className={`px-4 py-3 font-bold text-sm border-b-2 -mb-px ${logic.historyTab === 'office' ? 'border-[var(--green)] text-[var(--green)]' : 'border-transparent text-[var(--muted)]'}`}
                            >Điểm Office</button>
                            <button
                              onClick={() => logic.setHistoryTab('hours')}
                              className={`px-4 py-3 font-bold text-sm border-b-2 -mb-px ${logic.historyTab === 'hours' ? 'border-[var(--green)] text-[var(--green)]' : 'border-transparent text-[var(--muted)]'}`}
                            >Giờ tích lũy</button>
                          </div>

                          {logic.historyTab === 'office' && (
                            <>
                              {/* Bóc từng bước ra để KTV không thắc mắc vì sao ra con số này */}
                              <div className="bg-[var(--surface-soft)] p-4 rounded-2xl mb-5 text-sm">
                                <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-1">Điểm từng ngày · tháng {logic.month}</p>
                                <p className="text-xs text-[var(--muted)] mb-3">Mỗi ngày đi làm bắt đầu từ 100đ, trừ dần theo lỗi trong ngày đó.</p>
                                {o.days.length === 0 ? (
                                  <p className="py-3 text-xs text-[var(--muted)]">Chưa có ngày đi làm nào trong tháng.</p>
                                ) : o.days.map((d: any) => (
                                  <div key={d.workDate} className="flex justify-between items-baseline py-1.5 border-b border-[var(--line)]">
                                    <span>
                                      {fmtDate(d.workDate)}
                                      <span className="text-xs text-[var(--muted)] ml-2">
                                        {d.hits.length === 0 ? 'không vi phạm' : `${d.hits.length} lỗi`}
                                      </span>
                                    </span>
                                    <b className={d.hits.length === 0 ? 'text-[var(--green)]' : 'text-[var(--rust)]'}>{fmtNum(d.dayScore)}đ</b>
                                  </div>
                                ))}
                                <div className="flex justify-between py-2 mt-1">
                                  <span>Trung bình {o.workDays} ngày đi làm</span><b>{fmtNum(o.avg)}đ</b>
                                </div>
                                {o.repeats.length > 0 ? (
                                  <>
                                    <div className="flex justify-between py-1.5"><span>Phạt lỗi lặp ≥3 lần/tháng</span><b className="text-[var(--rust)]">−{fmtNum(o.repeatPenalty)}đ</b></div>
                                    {o.repeats.map((r: any) => (
                                      <div key={r.criteriaId} className="flex justify-between py-1 pl-4 text-xs text-[var(--muted)]">
                                        <span>{r.label} — lặp {r.times} lần</span><b className="text-[var(--rust)]">−{fmtNum(r.points)}đ</b>
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  <div className="flex justify-between py-1 pl-4 text-xs text-[var(--muted)]"><span>Không có lỗi nào lặp từ 3 lần</span><b>−0đ</b></div>
                                )}
                                <div className="flex justify-between py-2.5 border-t-2 border-[var(--line)] mt-2 text-base font-bold">
                                  <span>Điểm tháng</span><b>{fmtNum(o.score)}đ</b>
                                </div>
                                <div className="flex justify-between py-1 text-xs">
                                  <span className="text-[var(--muted)]">Quỹ nội bộ còn phải đóng{o.exemptPct > 0 ? ` (đã miễn ${o.exemptPct}%)` : ''}</span>
                                  <b className={o.fundDue === 0 ? 'text-[var(--green)]' : 'text-[var(--rust)]'}>{fmtMoney(o.fundDue)}</b>
                                </div>
                                <p className="text-xs text-[var(--muted)] mt-3 pt-3 border-t border-[var(--line)] leading-relaxed">
                                  Mỗi ngày đi làm bắt đầu từ 100 điểm. Điểm tháng là trung bình các ngày đi làm trong tháng — lỗi của tháng trước không tính sang tháng sau.
                                </p>
                              </div>

                              {/* Timeline chỉ liệt kê ngày CÓ vi phạm — bảng phía trên đã liệt kê đủ mọi ngày. */}
                              {o.days.filter((d: any) => d.hits.length > 0).length === 0 ? (
                                <p className="py-8 text-center text-[var(--muted)] text-sm">Tháng này chưa có phiếu trừ điểm nào.</p>
                              ) : (
                                <div className="pl-6 border-l-2 border-[var(--line)] ml-2">
                                  <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-3 -ml-6">Chi tiết vi phạm</p>
                                  {o.days.filter((d: any) => d.hits.length > 0).map((d: any) => (
                                    <div key={d.workDate} className="relative pb-6">
                                      <div className="absolute w-3.5 h-3.5 rounded-full border-2 border-[var(--rust)] bg-white -left-[32px] top-1"></div>
                                      <div className="flex justify-between items-baseline mb-2">
                                        <span className="text-xs text-[var(--muted)]">{fmtDate(d.workDate)}</span>
                                        <b className="text-sm">{fmtNum(d.dayScore)} / 100</b>
                                      </div>
                                      {d.hits.map((h: any) => (
                                        <div key={h.logId} className="bg-[var(--surface-soft)] rounded-xl p-3 mb-2">
                                          <div className="flex justify-between gap-3">
                                            <strong className="text-sm">{h.label}</strong>
                                            <b className="text-[var(--rust)] text-sm whitespace-nowrap">−{fmtNum(h.points)}đ</b>
                                          </div>
                                          {h.note && <p className="text-xs text-[var(--muted)] mt-1">{h.note}</p>}
                                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            {h.photoUrls.map((u: string, i: number) => (
                                              <a key={i} href={u} target="_blank" rel="noreferrer"
                                                 className="w-7 h-7 rounded border border-[var(--line)] flex items-center justify-center bg-white">
                                                <ImageIcon size={13} className="text-[var(--muted)]" />
                                              </a>
                                            ))}
                                            <span className="text-xs text-[var(--muted)]">
                                              {h.byName} · {new Date(h.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}

                          {logic.historyTab === 'hours' && (
                            hrs.rows.length === 0 ? (
                              <p className="py-8 text-center text-[var(--muted)] text-sm">Tháng này chưa có phát sinh giờ nào.</p>
                            ) : (
                              <>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm border-collapse">
                                    <thead>
                                      <tr className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
                                        <th className="text-left pb-2 pr-3">Ngày</th>
                                        <th className="text-left pb-2 pr-3">Nội dung</th>
                                        <th className="text-right pb-2 pr-3 whitespace-nowrap">Cộng</th>
                                        <th className="text-right pb-2 pr-3 whitespace-nowrap">Trừ</th>
                                        <th className="text-right pb-2 whitespace-nowrap">Còn lại</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {hrs.rows.map((r: any) => (
                                        <tr key={r.id} className="border-t border-[var(--line)]">
                                          <td className="py-2.5 pr-3 whitespace-nowrap">{fmtDate(r.date)}</td>
                                          <td className="py-2.5 pr-3">
                                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${r.penaltyLabel ? 'bg-[var(--rust-2)] text-[var(--rust)] border-[var(--rust)]' : 'bg-[var(--green-2)] text-[var(--green)] border-[var(--green)]'}`}>
                                              {r.penaltyLabel || 'Giờ làm khách'}
                                            </span>
                                            {/* Mã đơn quan trọng hơn ghi chú — đối chiếu ngược lại đơn hàng khi KTV thắc mắc. */}
                                            {r.orderCode && (
                                              <p className="text-xs font-mono font-bold text-[var(--ink)] mt-1" title={r.bookingId || ''}>{r.orderCode}</p>
                                            )}
                                            {r.note && <p className="text-xs text-[var(--muted)] mt-0.5">{r.note}</p>}
                                          </td>
                                          <td className="py-2.5 pr-3 text-right whitespace-nowrap text-[var(--green)] font-bold">{r.earned ? '+' + fmtHours(r.earned) : '—'}</td>
                                          <td className="py-2.5 pr-3 text-right whitespace-nowrap text-[var(--rust)] font-bold">{r.penalty ? '−' + fmtHours(r.penalty) : '—'}</td>
                                          <td className="py-2.5 text-right whitespace-nowrap font-bold">{fmtHours(r.balance)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <p className="text-xs text-[var(--muted)] mt-4 leading-relaxed">
                                  Giờ tích lũy quyết định <b>thứ tự nhận tua</b> trong ngày — KTV có tổng giờ cao hơn được xếp tua trước.
                                  Không liên quan tới điểm Office (dùng cho miễn quỹ nội bộ).
                                </p>
                              </>
                            )
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Sheet Footer */}
              <div className="p-4 border-t border-[var(--line)] flex gap-3 bg-white/95">
                {logic.sheetState.type === 'deduct' && (
                  <>
                    <button className="flex-none w-24 h-12 rounded-xl font-bold btn-ghost" onClick={logic.closeSheet}>Hủy</button>
                    <button className="flex-1 h-12 rounded-xl font-bold btn-primary disabled:opacity-50" disabled={logic.sheetState.selectedViolations.length === 0}>
                      Tiếp tục {logic.sheetState.selectedViolations.length > 0 && `· Trừ ${logic.sheetState.selectedViolations.reduce((a,b)=>a+b.points,0)} điểm`}
                    </button>
                  </>
                )}
                {logic.sheetState.type === 'unlock' && (
                  <>
                    <button className="flex-none w-24 h-12 rounded-xl font-bold btn-ghost" onClick={logic.closeSheet}>Hủy</button>
                    <button className="flex-1 h-12 rounded-xl font-bold btn-primary">Xác nhận mở khóa</button>
                  </>
                )}
                {logic.sheetState.type === 'history' && (
                  <button className="flex-1 h-12 rounded-xl font-bold btn-primary" onClick={logic.closeSheet}>Đóng</button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </AppLayout>
  );
};

export default AdminKtvOfficePage;
