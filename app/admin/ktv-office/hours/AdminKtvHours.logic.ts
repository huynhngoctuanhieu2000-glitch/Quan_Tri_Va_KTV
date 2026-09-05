'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui/Toast';
import { apiClient } from '@/lib/apiClient';

export interface HoursRow {
  id: string;
  code: string;
  name: string;
  avatarUrl: string | null;
  locked: boolean;
  /** Giờ làm THỰC trong dịch vụ, chưa trừ phạt. */
  earned: number;
  /** Giờ bị trừ do kỷ luật. */
  penalty: number;
  /** earned − penalty: con số dùng để xếp hạng và quyết định thứ tự nhận tua. */
  net: number;
  turns: number;
  days: number;
  lastDate: string | null;
  avgPerDay: number;
  rank: number;
}

/** Giờ thập phân → "18h 30P". Cùng định dạng với bảng điều phối và trang chấm điểm. */
export function fmtHours(h: number): string {
  const total = Number(h) || 0;
  const sign = total < 0 ? '−' : '';
  const abs = Math.abs(total);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  // Làm tròn phút có thể đẩy lên 60 (vd 2.999h) — dồn lên giờ cho khỏi hiện "2h 60P".
  if (mm === 60) return `${sign}${hh + 1}h 00P`;
  return `${sign}${hh}h ${String(mm).padStart(2, '0')}P`;
}

/** 'YYYY-MM-DD' → '03/09'. */
export function fmtShortDate(iso: string | null): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return m && d ? `${d}/${m}` : iso;
}

/** 'YYYY-MM' dịch đi `delta` tháng. */
function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' của tháng hiện tại theo giờ VN. */
function currentMonthVn(): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const useAdminKtvHoursLogic = () => {
  const { addToast } = useToast();

  const [month, setMonth] = useState<string>(currentMonthVn());
  const [searchQuery, setSearchQuery] = useState('');

  const [rawRows, setRawRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Sổ giờ chi tiết của 1 KTV, mở khi bấm vào thẻ.
  const [detailOf, setDetailOf] = useState<HoursRow | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const thisMonth = currentMonthVn();

  const fetchRanking = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Chỉ xem theo tháng: quy chế giờ loại D tính theo từng tháng, và đây cũng
      // là con số quyết định thứ tự nhận tua. API còn hỗ trợ scope=all (lũy kế
      // toàn bộ lịch sử) nhưng UI chưa dùng tới.
      const res = await apiClient.get<any>(
        `/api/admin/ktv-office/hours-ranking?scope=month&month=${month}`,
        { timeout: 20000 }
      );
      setRawRows(res?.data || []);
    } catch (error: any) {
      const msg = error?.status === 403
        ? 'Bạn không có quyền xem bảng giờ tích lũy.'
        : (error?.message || 'Không tải được bảng xếp hạng giờ.');
      setLoadError(msg);
      setRawRows([]);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [month, addToast]);

  useEffect(() => { fetchRanking(); }, [fetchRanking]);

  const changeMonth = (delta: number) => {
    // Không cho nhảy sang tháng chưa tới — sổ giờ chưa có gì, chỉ gây hiểu nhầm.
    const next = shiftMonth(month, delta);
    if (next > thisMonth) return;
    setMonth(next);
  };

  const canGoNext = month < thisMonth;

  /**
   * Xếp hạng theo GIỜ THỰC NHẬN (đã trừ phạt) — cùng con số quyết định thứ tự
   * nhận tua ở bảng điều phối, nên hai màn hình không bao giờ đọc ra hai thứ hạng.
   *
   * Tính trên TOÀN ĐỘI rồi mới lọc theo ô tìm kiếm: gõ tên một người vẫn phải thấy
   * đúng hạng của người đó trong đội, không phải hạng 1 giả.
   */
  const ranked: HoursRow[] = useMemo(() => {
    return [...rawRows]
      .sort((a, b) => (b.net - a.net) || (b.earned - a.earned) || a.name.localeCompare(b.name, 'vi'))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rawRows]);

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(r =>
      r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  }, [ranked, searchQuery]);

  const totals = useMemo(() => {
    const earned = rawRows.reduce((a, r) => a + (Number(r.earned) || 0), 0);
    const penalty = rawRows.reduce((a, r) => a + (Number(r.penalty) || 0), 0);
    const turns = rawRows.reduce((a, r) => a + (Number(r.turns) || 0), 0);
    // Trung bình chỉ tính trên người CÓ giờ: cộng cả người chưa làm buổi nào
    // sẽ kéo mức trung bình xuống và không nói lên điều gì.
    const active = rawRows.filter(r => (Number(r.earned) || 0) > 0).length;
    return {
      earned,
      penalty,
      net: earned - penalty,
      turns,
      staff: rawRows.length,
      active,
      avg: active > 0 ? (earned - penalty) / active : 0,
    };
  }, [rawRows]);

  /** Giờ thực nhận cao nhất — mốc để vẽ thanh tỉ lệ. */
  const maxValue = useMemo(
    () => ranked.reduce((m, r) => Math.max(m, r.net), 0),
    [ranked]
  );

  const openDetail = useCallback(async (row: HoursRow) => {
    setDetailOf(row);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await apiClient.get<any>(
        `/api/admin/ktv-office/hours-detail?staffId=${encodeURIComponent(row.code)}&month=${month}`
      );
      setDetail(res);
    } catch (error: any) {
      addToast(error?.message || 'Không tải được sổ giờ của KTV này.', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [month, addToast]);

  const closeDetail = () => {
    setDetailOf(null);
    setDetail(null);
  };

  return {
    month, changeMonth, canGoNext,
    searchQuery, setSearchQuery,
    rows, ranked, totals, maxValue,
    loading, loadError,
    refresh: fetchRanking,
    detailOf, detail, detailLoading, openDetail, closeDetail,
  };
};
