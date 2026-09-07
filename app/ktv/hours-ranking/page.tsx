'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChevronLeft, ChevronRight, RefreshCw, Trophy, Clock, Info, ListTree, X, AlertTriangle } from 'lucide-react';
import { useKtvHoursRankingLogic, RankRow, LedgerRow } from './KtvHoursRanking.logic';
import { fmtHours, fmtShortDate } from '@/lib/hours-format';

/** Màu huy chương 3 hạng đầu, theo đúng modal "Thứ tự tua" trên dashboard. */
const MEDAL: Record<number, string> = {
  1: 'bg-amber-100 text-amber-600',
  2: 'bg-slate-200 text-slate-600',
  3: 'bg-orange-100 text-orange-600',
};

const Avatar = ({ row, size = 40 }: { row: { name: string; avatarUrl: string | null }; size?: number }) => (
  <div
    style={{ width: size, height: size }}
    className="rounded-full bg-slate-100 text-slate-500 font-black flex items-center justify-center overflow-hidden shrink-0"
  >
    {row.avatarUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={row.avatarUrl} alt={row.name} className="w-full h-full object-cover" />
      : <span style={{ fontSize: size * 0.4 }}>{row.name.charAt(0).toUpperCase()}</span>}
  </div>
);

/** Thẻ thông báo dùng cho các trạng thái rỗng. */
const Notice = ({ title, desc }: { title: string; desc: string }) => (
  <div className="bg-white rounded-[32px] p-8 text-center shadow-sm border border-slate-100">
    <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
      <Info size={26} />
    </div>
    <p className="font-black text-slate-800">{title}</p>
    <p className="text-sm text-slate-400 font-medium mt-1 leading-relaxed">{desc}</p>
  </div>
);

const KtvHoursRankingPage = () => {
  const logic = useKtvHoursRankingLogic();
  const me = logic.me;

  return (
    <AppLayout title="Xếp Hạng Giờ">
      <div className="max-w-2xl mx-auto pb-24 space-y-4">

        {/* Chọn tháng */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
            <button onClick={() => logic.changeMonth(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50"><ChevronLeft size={19} /></button>
            <span className="min-w-[104px] text-center font-black text-sm text-slate-700">Tháng {logic.month}</span>
            <button
              onClick={() => logic.changeMonth(1)}
              disabled={!logic.canGoNext}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
            ><ChevronRight size={19} /></button>
          </div>
          <button
            onClick={logic.refresh}
            title="Tải lại"
            className="w-11 h-11 rounded-2xl bg-white shadow-sm border border-slate-100 text-slate-500 flex items-center justify-center"
          ><RefreshCw size={17} className={logic.loading ? 'animate-spin' : ''} /></button>
        </div>

        {logic.loading && (
          <p className="py-16 text-center text-slate-400 font-medium">Đang tải bảng xếp hạng…</p>
        )}

        {!logic.loading && logic.loadError && (
          <div className="bg-rose-50 border border-rose-100 text-rose-600 p-5 rounded-[32px] flex items-center justify-between gap-4 flex-wrap">
            <span className="font-bold text-sm">{logic.loadError}</span>
            <button onClick={logic.refresh} className="h-10 px-4 rounded-xl font-bold bg-rose-600 text-white text-sm">Thử lại</button>
          </div>
        )}

        {!logic.loading && !logic.loadError && !logic.applicable && (
          <Notice
            title="Chưa áp dụng cho nhóm của bạn"
            desc="Bảng xếp hạng giờ tích lũy hiện chỉ dành cho KTV Loại D — nhóm chia tua theo giờ làm."
          />
        )}

        {!logic.loading && !logic.loadError && logic.applicable && !logic.enabled && (
          <Notice
            title="Quản lý đã tắt bảng xếp hạng"
            desc="Tính năng này đang được tắt trong Cài đặt hệ thống. Liên hệ quản lý nếu bạn cần xem."
          />
        )}

        {!logic.loading && !logic.loadError && logic.applicable && logic.enabled && (
          <>
            {/* Thẻ của chính mình */}
            {me && (
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[32px] p-5 shadow-lg text-white">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/30 shrink-0">
                    <Trophy size={26} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[10px] uppercase tracking-widest text-blue-100">Hạng của bạn</p>
                    <p className="font-black text-3xl leading-none mt-1">
                      {me.rank}
                      <span className="text-sm font-medium opacity-70 ml-1">/ {logic.rows.length}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[10px] uppercase tracking-widest text-blue-100">Thực nhận</p>
                    <p className="font-black text-2xl leading-none mt-1">{fmtHours(me.net)}</p>
                  </div>
                </div>

                {/* Ba ô làm thực / bị phạt / thực nhận đã gộp vào bảng chi tiết —
                    trên thẻ chỉ giữ con số quyết định (thực nhận) cho đỡ rối. */}
                <button
                  onClick={() => logic.setShowDetail(true)}
                  className="w-full mt-4 bg-white/15 hover:bg-white/25 active:scale-[0.98] backdrop-blur-sm rounded-2xl px-4 py-3 flex items-center justify-center gap-2 transition-all border border-white/20"
                >
                  <ListTree size={16} />
                  <span className="font-black text-sm uppercase tracking-wider">Xem chi tiết</span>
                </button>

                <p className="text-[11px] font-medium text-blue-100 mt-3 flex items-center gap-1.5">
                  <Clock size={12} className="shrink-0" />
                  {me.turns} tua · {me.days ?? 0} ngày · gần nhất {fmtShortDate(me.lastDate)}
                </p>
              </div>
            )}

            {logic.rows.length === 0 ? (
              <Notice
                title="Tháng này chưa có dữ liệu"
                desc="Chưa có tua nào được ghi vào sổ giờ trong tháng đang xem."
              />
            ) : (
              <>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 px-1 pt-2">
                  Cả nhóm · {logic.rows.length} KTV
                </p>

                <div className="space-y-2">
                  {logic.rows.map((r: RankRow) => {
                    const pct = logic.maxNet > 0 ? Math.max(0, (r.net / logic.maxNet) * 100) : 0;
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center gap-3 p-4 rounded-[24px] border ${
                          r.isMe
                            ? 'bg-blue-50 border-blue-200 shadow-md shadow-blue-100/50'
                            : 'bg-white border-slate-100 shadow-sm'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${MEDAL[r.rank] || 'bg-slate-100 text-slate-400'}`}>
                          #{r.rank}
                        </div>

                        <Avatar row={r} />

                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${r.isMe ? 'text-blue-700' : 'text-slate-700'}`}>
                            {r.name}
                            {r.isMe && <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded ml-1.5 align-middle">BẠN</span>}
                          </p>
                          <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                            <div
                              style={{ width: `${pct}%` }}
                              className={`h-full rounded-full ${r.net < 0 ? 'bg-rose-400' : r.isMe ? 'bg-blue-500' : 'bg-slate-300'}`}
                            />
                          </div>
                          <p className="text-[10px] font-medium text-slate-400 mt-1">{r.code} · {r.turns} tua</p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className={`font-black text-lg leading-none tabular-nums ${r.isMe ? 'text-blue-600' : 'text-slate-600'}`}>
                            {fmtHours(r.net)}
                          </p>
                          <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mt-1">Giờ làm</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <p className="text-[11px] text-slate-400 font-medium leading-relaxed bg-white rounded-[24px] p-4 border border-slate-100">
              Xếp theo <b className="text-slate-600">giờ thực nhận</b> — giờ làm thực trong dịch vụ trừ đi giờ bị phạt
              kỷ luật. Đây cũng là con số quyết định thứ tự nhận tua. Số liệu cập nhật ngay khi bạn kết thúc đơn.
              Giờ làm thực và giờ bị phạt của đồng nghiệp không hiển thị.
            </p>
          </>
        )}
      </div>

      {logic.showDetail && me && (
        <HoursDetailSheet
          me={me}
          month={logic.month}
          ledger={logic.ledger}
          onClose={() => logic.setShowDetail(false)}
        />
      )}
    </AppLayout>
  );
};

/**
 * Sổ giờ chi tiết dạng dòng thời gian.
 *
 * Cùng dữ liệu với màn Office của quầy (KtvOfficeScoreService.hoursLedger) nên
 * hai bên không bao giờ ra số khác nhau. Khác ở cách bày: mốc thời gian dọc cho
 * dễ đọc trên điện thoại, và cột "còn lại" chạy dồn để KTV thấy giờ mình lớn dần
 * qua từng tua thay vì chỉ thấy một con số tổng.
 */
const HoursDetailSheet = ({ me, month, ledger, onClose }: {
  me: RankRow; month: string; ledger: LedgerRow[]; onClose: () => void;
}) => (
  <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

    <div className="relative bg-white w-full sm:max-w-lg rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h3 className="font-black text-slate-900 text-lg leading-tight">Sổ giờ của bạn</h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            {me.code} · Tháng {month} · Hạng {me.rank}
          </p>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
          <X size={18} />
        </button>
      </div>

      {/* Ba con số tổng — chuyển từ thẻ ngoài vào đây */}
      <div className="grid grid-cols-3 gap-2 p-5 pb-4 shrink-0">
        <div className="bg-slate-50 rounded-2xl p-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Làm thực</p>
          <p className="text-base font-black tabular-nums mt-1 text-slate-700">{fmtHours(me.earned ?? 0)}</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Bị phạt</p>
          <p className={`text-base font-black tabular-nums mt-1 ${(me.penalty ?? 0) > 0 ? 'text-rose-500' : 'text-slate-700'}`}>
            {(me.penalty ?? 0) > 0 ? `− ${fmtHours(me.penalty ?? 0)}` : fmtHours(0)}
          </p>
        </div>
        <div className="bg-blue-600 rounded-2xl p-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-blue-100">Thực nhận</p>
          <p className="text-base font-black tabular-nums mt-1 text-white">{fmtHours(me.net)}</p>
        </div>
      </div>

      <div className="px-5 shrink-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Dòng thời gian · mới nhất trước
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {ledger.length === 0 ? (
          <p className="text-center text-slate-400 text-sm font-medium py-10">
            Tháng này chưa có tua nào được ghi sổ.
          </p>
        ) : (
          <div className="relative pl-6">
            {/* Sợi dọc của dòng thời gian */}
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-100 rounded-full" />

            {ledger.map((r) => {
              const isPenalty = !!r.penaltyLabel;
              return (
                <div key={r.id} className="relative pb-4 last:pb-0">
                  <div className={`absolute -left-6 top-1.5 w-4 h-4 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center ${isPenalty ? 'bg-rose-500' : 'bg-blue-500'}`}>
                    {isPenalty && <AlertTriangle size={7} className="text-white" />}
                  </div>

                  <div className={`rounded-2xl p-3 border ${isPenalty ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          {fmtShortDate(r.date)}
                        </p>
                        <p className={`text-sm font-bold leading-snug mt-0.5 ${isPenalty ? 'text-rose-700' : 'text-slate-800'}`}>
                          {isPenalty ? r.penaltyLabel : (r.note || 'Tua phục vụ')}
                        </p>
                        {r.orderCode && (
                          <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5 truncate">{r.orderCode}</p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p className={`text-sm font-black tabular-nums ${isPenalty ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {isPenalty ? `− ${fmtHours(r.penalty)}` : `+ ${fmtHours(r.earned)}`}
                        </p>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                          Còn {fmtHours(r.balance)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 shrink-0">
        <button onClick={onClose} className="w-full h-12 rounded-2xl font-black bg-slate-900 text-white active:scale-[0.98] transition-transform">
          Đóng
        </button>
      </div>
    </div>
  </div>
);

export default KtvHoursRankingPage;
