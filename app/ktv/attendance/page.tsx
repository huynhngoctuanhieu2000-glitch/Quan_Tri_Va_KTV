'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import {
  ShieldAlert, MapPin, Clock, CheckCircle2,
  ExternalLink, Loader2, XCircle, LogOut, LogIn
} from 'lucide-react';
import { format } from 'date-fns';

// 🔧 UI CONFIGURATION
const GPS_TIMEOUT_MS = 10000;
const GPS_HIGH_ACCURACY = true;

type CheckStatus = 'IDLE' | 'LOADING_GPS' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CHECKED_OUT';

interface AttendanceRecord {
  id: string;
  checkType: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  locationText: string | null;
  checkedAt: string;
}

const KTVAttendancePage = () => {
  const { hasPermission, user } = useAuth();

  const [checkStatus, setCheckStatus] = useState<CheckStatus>('IDLE');
  const [currentRecord, setCurrentRecord] = useState<AttendanceRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // ─── Realtime: lắng nghe KTVAttendance record của mình ─────────────
  useEffect(() => {
    if (!user?.id || !currentRecord?.id) return;

    const channel = supabase
      .channel(`attendance_${currentRecord.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'KTVAttendance',
        filter: `id=eq.${currentRecord.id}`,
      }, (payload) => {
        const updated = payload.new as AttendanceRecord;
        setCurrentRecord(updated);

        if (updated.status === 'CONFIRMED') {
          setCheckStatus(updated.checkType === 'CHECK_OUT' ? 'CHECKED_OUT' : 'CONFIRMED');
        } else if (updated.status === 'REJECTED') {
          setCheckStatus('REJECTED');
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, currentRecord?.id]);

  // ─── Get GPS ────────────────────────────────────────────────────────
  const getGPS = (): Promise<{ latitude: number; longitude: number; locationText: string }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Trình duyệt không hỗ trợ GPS'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          locationText: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        }),
        (err) => reject(new Error(err.code === 1
          ? 'Bạn chưa cấp quyền GPS. Vào cài đặt trình duyệt để cho phép.'
          : 'Không lấy được vị trí GPS. Thử lại sau.'
        )),
        { enableHighAccuracy: GPS_HIGH_ACCURACY, timeout: GPS_TIMEOUT_MS }
      );
    });
  };

  // ─── Handle check-in or check-out ───────────────────────────────────
  const handleAttendance = useCallback(async (checkType: 'CHECK_IN' | 'CHECK_OUT') => {
    setErrorMsg(null);
    setCheckStatus('LOADING_GPS');

    try {
      const gps = await getGPS();

      const res = await fetch('/api/ktv/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: user?.id,
          employeeName: user?.id || 'KTV',
          checkType,
          ...gps,
        }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Lỗi gửi điểm danh');

      setCurrentRecord(result.data);
      setCheckStatus('PENDING');
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi không xác định');
      setCheckStatus(checkType === 'CHECK_IN' ? 'IDLE' : 'CONFIRMED');
    }
  }, [user?.id]);

  if (!mounted) return null;

  if (!hasPermission('ktv_attendance')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  const mapsUrl = currentRecord?.latitude && currentRecord?.longitude
    ? `https://maps.google.com/?q=${currentRecord.latitude},${currentRecord.longitude}`
    : null;

  return (
    <AppLayout>
      <div className="max-w-sm mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Chấm Công</h1>
          <p className="text-sm text-gray-500 mt-1">Bấm nút để ghi nhận vị trí và thông báo quản lý.</p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg p-8 flex flex-col items-center gap-6">

          {/* ─── IDLE: Nút Điểm Danh ─── */}
          {checkStatus === 'IDLE' && (
            <>
              <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center">
                <LogIn size={40} className="text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-800">Bắt đầu ca làm việc</p>
                <p className="text-sm text-gray-400 mt-1">Hệ thống sẽ ghi nhận vị trí GPS của bạn</p>
              </div>
              <button
                onClick={() => handleAttendance('CHECK_IN')}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-lg rounded-2xl transition-all shadow-md shadow-emerald-200"
              >
                ĐIỂM DANH
              </button>
            </>
          )}

          {/* ─── LOADING GPS ─── */}
          {checkStatus === 'LOADING_GPS' && (
            <>
              <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center">
                <MapPin size={40} className="text-blue-400 animate-bounce" />
              </div>
              <div className="flex items-center gap-2 text-blue-600 font-medium">
                <Loader2 size={18} className="animate-spin" />
                Đang lấy vị trí GPS...
              </div>
            </>
          )}

          {/* ─── PENDING: Chờ Admin ─── */}
          {checkStatus === 'PENDING' && (
            <>
              <div className="w-24 h-24 rounded-full bg-amber-50 flex items-center justify-center">
                <Clock size={40} className="text-amber-500 animate-pulse" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-bold text-amber-700 text-lg">Đang chờ xác nhận</p>
                <p className="text-sm text-gray-500">Admin đang kiểm tra vị trí GPS của bạn</p>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700 mt-2">
                    <MapPin size={13} /> Vị trí của bạn <ExternalLink size={11} />
                  </a>
                )}
                {currentRecord?.checkedAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    Gửi lúc: {format(new Date(currentRecord.checkedAt), 'HH:mm:ss dd/MM/yyyy')}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ─── CONFIRMED: Vào ca thành công → nút Tan Ca ─── */}
          {checkStatus === 'CONFIRMED' && (
            <>
              <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={40} className="text-emerald-600" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-bold text-emerald-700 text-lg">✅ Đã điểm danh</p>
                <p className="text-sm text-gray-500">Admin đã xác nhận vị trí của bạn</p>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700">
                    <MapPin size={13} /> Xem vị trí <ExternalLink size={11} />
                  </a>
                )}
                {currentRecord?.checkedAt && (
                  <p className="text-xs text-gray-400">
                    Vào ca: {format(new Date(currentRecord.checkedAt), 'HH:mm — dd/MM/yyyy')}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleAttendance('CHECK_OUT')}
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-lg rounded-2xl transition-all shadow-md shadow-rose-200 flex items-center justify-center gap-2"
              >
                <LogOut size={22} /> TAN CA
              </button>
            </>
          )}

          {/* ─── REJECTED: Admin từ chối ─── */}
          {checkStatus === 'REJECTED' && (
            <>
              <div className="w-24 h-24 rounded-full bg-red-50 flex items-center justify-center">
                <XCircle size={40} className="text-red-500" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-bold text-red-700 text-lg">❌ Admin đã từ chối</p>
                <p className="text-sm text-gray-500">Vui lòng liên hệ quản lý để được hỗ trợ</p>
              </div>
              <button
                onClick={() => { setCheckStatus('IDLE'); setCurrentRecord(null); setErrorMsg(null); }}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-2xl transition-all"
              >
                Thử lại
              </button>
            </>
          )}

          {/* ─── CHECKED_OUT: Tan ca thành công ─── */}
          {checkStatus === 'CHECKED_OUT' && (
            <>
              <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center">
                <LogOut size={40} className="text-slate-500" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-bold text-slate-700 text-lg">Đã tan ca</p>
                <p className="text-sm text-gray-400">Cảm ơn bạn đã làm việc hôm nay!</p>
              </div>
            </>
          )}

          {/* Error message */}
          {errorMsg && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default KTVAttendancePage;
