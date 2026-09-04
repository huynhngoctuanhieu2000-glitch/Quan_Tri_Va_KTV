import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { apiClient } from '@/lib/apiClient';

export type SheetType = 'deduct' | 'unlock' | 'history' | null;
export type FilterMode = 'Tất cả' | 'Cần xử lý' | 'Điểm thấp';

const FILTER_MODES: FilterMode[] = ['Tất cả', 'Cần xử lý', 'Điểm thấp'];

export const useAdminKtvOfficeLogic = () => {
  const { addToast } = useToast();

  const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // giờ VN
  const [month, setMonth] = useState<number>(now.getUTCMonth() + 1);
  const [year, setYear] = useState<number>(now.getUTCFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('Tất cả');

  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Chi tiết 1 KTV (điểm Office + sổ giờ), tải khi mở sheet Lịch sử.
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<'office' | 'hours'>('office');

  const [sheetState, setSheetState] = useState<{
    isOpen: boolean;
    type: SheetType;
    person: string;
    code: string;
    score: number;
    date: string;
    selectedViolations: Array<{ name: string; points: number }>;
    files: File[];
  }>({
    isOpen: false,
    type: null,
    person: '',
    code: '',
    score: 100,
    date: new Date().toLocaleDateString('vi-VN'),
    selectedViolations: [],
    files: [],
  });

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.get<any>(`/api/admin/ktv-office/summary?month=${monthStr}`);
      setStaffList(res?.data || []);
    } catch (error: any) {
      const msg = error?.status === 403
        ? 'Bạn không có quyền xem trang chấm điểm.'
        : (error?.message || 'Không tải được danh sách KTV.');
      setLoadError(msg);
      setStaffList([]);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [monthStr, addToast]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const fetchDetail = useCallback(async (code: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await apiClient.get<any>(`/api/admin/ktv-office/staff/${code}?month=${monthStr}`);
      setDetail(res);
    } catch (error: any) {
      addToast(error?.message || 'Không tải được lịch sử của KTV này.', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [monthStr, addToast]);

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  };

  const openSheet = (type: Exclude<SheetType, null>, person: string, code: string, score = 100) => {
    setSheetState(prev => ({ ...prev, isOpen: true, type, person, code, score, selectedViolations: [], files: [] }));
    if (type === 'history') {
      setHistoryTab('office');
      fetchDetail(code);
    }
  };

  const closeSheet = () => setSheetState(prev => ({ ...prev, isOpen: false }));

  const toggleFilter = () => {
    setFilterMode(prev => FILTER_MODES[(FILTER_MODES.indexOf(prev) + 1) % FILTER_MODES.length]);
  };

  return {
    month, year, monthStr, changeMonth,
    searchQuery, setSearchQuery,
    filterMode, toggleFilter,
    staffList, loading, loadError, refresh: fetchSummary,
    detail, detailLoading, historyTab, setHistoryTab,
    sheetState, openSheet, closeSheet, setSheetState,
  };
};
