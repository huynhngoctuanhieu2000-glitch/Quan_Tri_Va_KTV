import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { apiClient } from '@/lib/apiClient';

export type SheetType = 'deduct' | 'unlock' | 'history' | null;
export type FilterMode = 'Tất cả' | 'Cần xử lý' | 'Điểm thấp';

const FILTER_MODES: FilterMode[] = ['Tất cả', 'Cần xử lý', 'Điểm thấp'];

const MAX_PHOTOS = 5;

/** 'YYYY-MM-DD' theo giờ VN, lùi n ngày. */
export function vnTodayStr(daysAgo = 0): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000 - daysAgo * 86400000);
  return vn.toISOString().slice(0, 10);
}

/**
 * Nén ảnh trước khi gửi — ảnh điện thoại 4-8MB gửi thẳng sẽ vỡ giới hạn body
 * của API route và làm lễ tân chờ rất lâu trên mạng 3G ở tiệm.
 */
function compressImage(file: File, maxSize = 1280, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Ảnh không hợp lệ'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Trình duyệt không hỗ trợ nén ảnh'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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

  // 18 tiêu chí đọc từ DB — không hard-code ở UI để Admin sửa quy chế khỏi phải deploy.
  const [criteriaGroups, setCriteriaGroups] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [sheetState, setSheetState] = useState<{
    isOpen: boolean;
    type: SheetType;
    person: string;
    code: string;
    score: number;
    workDate: string;              // 'YYYY-MM-DD' gửi lên server
    selectedIds: string[];         // criteria_id đã tích
    note: string;
    photos: string[];              // base64 đã nén
  }>({
    isOpen: false,
    type: null,
    person: '',
    code: '',
    score: 100,
    workDate: vnTodayStr(),
    selectedIds: [],
    note: '',
    photos: [],
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

  const fetchCriteria = useCallback(async () => {
    if (criteriaGroups.length > 0) return;
    try {
      const res = await apiClient.get<any>('/api/admin/ktv-office/criteria');
      setCriteriaGroups(res?.groups || []);
    } catch (error: any) {
      addToast(error?.message || 'Không tải được danh sách tiêu chí.', 'error');
    }
  }, [criteriaGroups.length, addToast]);

  const openSheet = (type: Exclude<SheetType, null>, person: string, code: string, score = 100) => {
    setSheetState(prev => ({
      ...prev, isOpen: true, type, person, code, score,
      workDate: vnTodayStr(), selectedIds: [], note: '', photos: [],
    }));
    if (type === 'history') {
      setHistoryTab('office');
      fetchDetail(code);
    }
    if (type === 'deduct') fetchCriteria();
  };

  const closeSheet = () => setSheetState(prev => ({ ...prev, isOpen: false }));

  const toggleCriteria = (id: string) => {
    setSheetState(prev => ({
      ...prev,
      selectedIds: prev.selectedIds.includes(id)
        ? prev.selectedIds.filter(x => x !== id)
        : [...prev.selectedIds, id],
    }));
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - sheetState.photos.length;
    if (room <= 0) {
      addToast(`Tối đa ${MAX_PHOTOS} ảnh.`, 'error');
      return;
    }
    const picked: string[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      try {
        picked.push(await compressImage(file));
      } catch (e: any) {
        addToast(e?.message || 'Không xử lý được ảnh này.', 'error');
      }
    }
    if (picked.length) setSheetState(prev => ({ ...prev, photos: [...prev.photos, ...picked] }));
  };

  const removePhoto = (index: number) => {
    setSheetState(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }));
  };

  /** Tất cả tiêu chí phẳng, để tra điểm và cờ bắt buộc ảnh. */
  const allCriteria: any[] = criteriaGroups.flatMap(g => g.items || []);
  const selectedCriteria = sheetState.selectedIds
    .map(id => allCriteria.find(c => c.id === id))
    .filter(Boolean);
  const totalPoints = selectedCriteria.reduce((a, c: any) => a + (c.points || 0), 0);
  const needPhoto = selectedCriteria.some((c: any) => c.requiresPhoto);
  const canSubmit = sheetState.selectedIds.length > 0 && (!needPhoto || sheetState.photos.length > 0);

  const submitDeduct = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post<any>('/api/admin/ktv-office/deduct', {
        staffId: sheetState.code,
        workDate: sheetState.workDate,
        criteriaIds: sheetState.selectedIds,
        note: sheetState.note,
        photosBase64: sheetState.photos,
      }, { timeout: 60000 });

      addToast(`Đã trừ ${res.totalPoints} điểm của ${sheetState.person}. KTV đã nhận thông báo.`, 'success');
      closeSheet();
      await fetchSummary();
    } catch (error: any) {
      addToast(error?.message || 'Không lưu được phiếu trừ điểm.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
    criteriaGroups, toggleCriteria, addPhotos, removePhoto,
    totalPoints, needPhoto, canSubmit, submitting, submitDeduct,
    maxPhotos: MAX_PHOTOS,
  };
};
