'use client';

// 🔧 UI CONFIGURATION
const DEFAULT_DURATION = 60; // Phút mặc định cho mỗi KTV

import React, { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import {
  ShieldAlert, Clock, CheckCircle2, Bell, BellOff,
  Plus, Calendar as CalendarIcon, Send, Phone,
  ChevronDown, ChevronLeft, Package, Volume2, VolumeX, Trash2, X, Sparkles, QrCode, LayoutList, Columns3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { DispatchServiceBlock } from './_components/DispatchServiceBlock';
import { KanbanBoard } from './_components/KanbanBoard';
import { getDispatchData, processDispatch, cancelBooking, updateBookingStatus, createQuickBooking } from './actions';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { AddOrderModal } from './_components/AddOrderModal';
import { useNotifications } from '@/components/NotificationProvider';

// ─── TYPES ────────────────────────────────────────────────────────────────────
import { 
  StaffAssignment, 
  WorkSegment,
  ServiceBlock, 
  DispatchStatus, 
  PendingOrder, 
  StaffData, 
  TurnQueueData, 
  StaffNotification 
} from './types';















// ─── MOCK DATA ────────────────────────────────────────────────────────────────

// MOCK DATA REMOVED - Using real data from Supabase

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const getCurrentTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatTime = (timeStr: string | null | undefined) => {
  if (!timeStr) return null;
  // If it's HH:mm:ss, take HH:mm
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return timeStr;
};

const calcEndTime = (start: string, duration: number): string => {
  if (!start || !duration) return '';
  const [h, m] = start.split(':').map(Number);
  const end = new Date();
  end.setHours(h, m + Math.floor(duration), Math.floor((duration % 1) * 60), 0);
  return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
};

const genId = () => Math.random().toString(36).slice(2, 8);

const QUICK_SERVICES_LIST = [
  { name: 'Massage Body 60p', duration: 60 },
  { name: 'Massage Body 90p', duration: 90 },
  { name: 'Massage Chân 30p', duration: 30 },
  { name: 'Massage Chân 45p', duration: 45 },
  { name: 'Gội Đầu Dưỡng Sinh 60p', duration: 60 },
  { name: 'Chăm Sóc Da Mặt 75p', duration: 75 },
  { name: 'Scrub Tay 20p', duration: 20 },
  { name: 'Đắp Mặt Nạ 30p', duration: 30 },
  { name: 'Tẩy Tế Bào Chết 30p', duration: 30 },
  { name: 'Massage Đá Nóng 90p', duration: 90 },
];

export default function DispatchBoardPage() {
  const { hasPermission } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  const [staffs, setStaffs] = useState<StaffData[]>([]);
  const [turns, setTurns] = useState<(TurnQueueData & { staff?: StaffData })[]>([]);
  const [loading, setLoading] = useState(true);

  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [allServices, setAllServices] = useState<any[]>([]);
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const { notifications, soundEnabled, setSoundEnabled, unlockAudio, playSound } = useNotifications();
  const [leftPanelTab, setLeftPanelTab] = useState<DispatchStatus>('pending');
  const [activeMode, setActiveMode] = useState<'DISPATCH' | 'MONITOR'>('DISPATCH');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAddSvcModal, setShowAddSvcModal] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [roomTransitionTime, setRoomTransitionTime] = useState(5);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const lastSoundTimeRef = useRef<number>(0);
  const push = usePushNotifications(user?.id);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, orderId: string } | null>(null);
  const [qrModal, setQrModal] = useState<{ orderId: string; billCode: string; accessToken?: string | null; customerLang?: string } | null>(null);

  // 🔧 QR CONFIGURATION
  const JOURNEY_BASE_URL = 'https://nganha.vercel.app';
  const QR_SIZE = 250;

  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // 🛡️ Ref to track if admin is actively editing dispatch form
  const selectedOrderIdRef = useRef(selectedOrderId);
  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId;
  }, [selectedOrderId]);

  // 📡 Realtime Subscriptions
  useEffect(() => {
    setMounted(true);
    fetchData();

    const channel = supabase
      .channel('dispatch_board_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Bookings' }, (payload) => {
        console.log("🔔 [Dispatch] New Booking detected!", payload.new.id);
        
        // NotificationProvider will handle the sound via StaffNotifications trigger
        // Always refetch on INSERT to get related BookingItems & mapping
        fetchData();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Bookings' }, (payload: any) => {
        console.log("🔄 [Dispatch] Booking updated:", payload.new.id, payload.new.status);
        
        // 🚀 STATE PATCHING: Update status locally before refetching
        setOrders(prev => prev.map(o => 
          o.id === payload.new.id 
            ? { ...o, rawStatus: payload.new.status, dispatchStatus: (payload.new.status === 'DONE' && !o.hasAssignedKtv) ? 'done' : (payload.new.status === 'FEEDBACK' ? 'waiting_rating' : o.dispatchStatus) } 
            : o
        ));

        // 🛡️ Skip full refetch if admin is editing dispatch form — avoid losing unsaved changes
        if (selectedOrderIdRef.current) {
          console.log('🛡️ [Dispatch] Skipping fetchData — admin editing form');
          return;
        }
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'TurnQueue' }, (payload: any) => {
        console.log("🔄 [Dispatch] TurnQueue change:", payload.eventType);
        
        // 🚀 STATE PATCHING: Update turns list locally
        if (payload.eventType === 'UPDATE') {
          setTurns(prev => prev.map(t => t.employee_id === payload.new.employee_id ? { ...t, ...payload.new } : t));
        } else {
          // INSERT or DELETE: full sync — but skip if editing
          if (!selectedOrderIdRef.current) fetchData();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'StaffNotifications' }, (payload) => {
        console.log("📡 [Dispatch] New StaffNotification", payload.new.type);
        // 🛡️ Skip refetch if editing form
        if (!selectedOrderIdRef.current) fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate]); // REMOVED soundEnabled from deps


  const fetchData = async () => {
    setLoading(true);
    console.log("📡 [Dispatch] Fetching data for date:", selectedDate);
    try {
      const res = await getDispatchData(selectedDate);
      console.log("🔍 [Dispatch] getDispatchData response:", {
        success: res.success,
        bookingsCount: res.data?.bookings?.length,
        firstBooking: res.data?.bookings?.[0]?.billCode,
        firstItem: res.data?.bookings?.[0]?.BookingItems?.[0]
      });
      
      if (!res.success || !res.data) {
        console.error("❌ [Dispatch] Server Action error:", JSON.stringify(res, null, 2));
        setLoading(false);
        return;
      }

      const { staffs: sData, turns: tData, bookings: bData } = res.data;

      // 1. Set Staffs
      if (sData) {
        setStaffs(sData as StaffData[]);
      }

      // 2. Set Turns
      if (tData && sData) {
        const merged = (tData as TurnQueueData[]).map((t: TurnQueueData) => ({
          ...t,
          staff: (sData as StaffData[]).find(s => s.id === t.employee_id)
        }));
        setTurns(merged);
      }

      // 3. Set Rooms & Beds
      const rData = res.data.rooms || [];
      const bdData = res.data.beds || [];
      setRooms(rData);
      setBeds(bdData);
      if (res.data.allServices) setAllServices(res.data.allServices);
      if (res.data.roomTransitionTime !== undefined) setRoomTransitionTime(res.data.roomTransitionTime);
      console.log(`✅ [Dispatch] Loaded ${rData.length} rooms and ${bdData.length} beds, Transition: ${res.data.roomTransitionTime}m`);

        // 4. Set Bookings
      if (bData) {
        const mappedOrders: PendingOrder[] = (bData as any[]).filter(b => b.status !== 'CANCELLED').map(b => {
          // Tìm tất cả KTV đang được gán cho đơn này trong TurnQueue
          const assignedTurns = tData?.filter((t: any) => t.current_order_id === b.id) || [];
          const hasAssignedKtv = assignedTurns.length > 0;

          let dStatus: DispatchStatus = 'pending';
          if (b.status === 'PREPARING') dStatus = 'dispatched';
          else if (b.status === 'IN_PROGRESS') dStatus = 'in_progress';
          else if (b.status === 'FEEDBACK') dStatus = 'waiting_rating';
          else if (b.status === 'COMPLETED') dStatus = 'cleaning';
          else if (b.status === 'DONE' && hasAssignedKtv) dStatus = 'cleaning';
          else if (b.status === 'DONE') dStatus = 'done';
          else if (hasAssignedKtv) dStatus = 'dispatched'; // Fallback for transition state
          
          return {
            id: b.id,
            billCode: b.billCode || 'N/A',
            customerName: b.customerName || 'Khách vãng lai',
            customerLang: b.customerLang || 'vi',
            phone: b.customerPhone || '',
            time: b.timeBooking || (b.createdAt ? b.createdAt.substring(11, 16) : '--:--'),
            dispatchStatus: dStatus,
            createdAt: b.createdAt || new Date().toISOString(),
            totalAmount: b.totalAmount || 0,
            paymentMethod: b.paymentMethod || 'Chưa rõ',
            rawStatus: b.status,
            hasAssignedKtv,
            accessToken: b.accessToken || null,
            timeStart: b.timeStart || null,
            timeEnd: b.timeEnd || null,
            services: (b.BookingItems || []).map((bi: any) => {
              const itemTurns = assignedTurns.filter((t: any) => {
                  if (!t.booking_item_id) return false;
                  if (typeof t.booking_item_id === 'string') return t.booking_item_id.includes(bi.id);
                  return t.booking_item_id === bi.id;
              });
              const finalItemTurns = (itemTurns.length === 0 && (b.BookingItems || []).length === 1) ? assignedTurns : itemTurns;

              const staffList = (finalItemTurns.length > 0) 
                ? finalItemTurns.map((t: any) => {
                    const staff = (sData as StaffData[])?.find((s: any) => s.id === t.employee_id);
                    
                    // Reconstruct segments
                    let parsedSegments: any[] = [];
                    try {
                        parsedSegments = typeof bi.segments === 'string' ? JSON.parse(bi.segments) : (Array.isArray(bi.segments) ? bi.segments : []);
                    } catch(e) { parsedSegments = []; }

                    let segments: WorkSegment[] = parsedSegments.filter((s: any) => s.ktvId === t.employee_id);
                    
                    if (segments.length === 0) {
                        const st = formatTime(t.start_time) || b.timeBooking || getCurrentTime();
                        const dur = bi.duration ?? 0;
                        segments = [{
                            id: `seg-${genId()}`,
                            roomId: t.room_id || bi.roomName || b.roomName,
                            bedId: t.bed_id || bi.bedId || b.bedId,
                            startTime: st,
                            duration: dur,
                            endTime: formatTime(t.estimated_end_time) || calcEndTime(st, dur)
                        }];
                    }

                    return {
                      id: `st-${bi.id}-${t.employee_id}`,
                      ktvId: t.employee_id,
                      ktvName: staff?.full_name || 'KTV',
                      segments: segments,
                      noteForKtv: bi.options?.noteForKtv || ''
                    };
                  })
                : [{
                    id: `st-${bi.id}`,
                    ktvId: '',
                    ktvName: '',
                    segments: [{
                        id: `seg-${genId()}`,
                        roomId: null,
                        bedId: null,
                        startTime: getCurrentTime(),
                        duration: bi.duration ?? 0,
                        endTime: calcEndTime(getCurrentTime(), bi.duration ?? 0)
                    }],
                    noteForKtv: ''
                  }];

              return {
                id: bi.id,
                serviceId: bi.serviceId,
                serviceName: bi.serviceName || bi.service_name || 'Dịch vụ',
                serviceDescription: bi.serviceDescription || bi.service_description || '',
                duration: Number(bi.duration) || 0,
                selectedRoomId: bi.roomName || b.roomName || null,
                bedId: bi.bedId || b.bedId || null,
                staffList: staffList,
                adminNote: b.notes || '',
                genderReq: bi.options?.therapist || 'Ngẫu nhiên',
                strength: bi.options?.strength || '',
                focus: Array.isArray(bi.options?.focus) ? bi.options.focus.join(', ') : (bi.options?.focus || b.focusAreaNote || ''),
                avoid: Array.isArray(bi.options?.avoid) ? bi.options.avoid.join(', ') : (bi.options?.avoid || ''),
                customerNote: [
                  bi.options?.note,
                  Array.isArray(bi.options?.tags) && bi.options.tags.length > 0 ? `Yêu cầu đặc biệt: ${bi.options.tags.join(', ')}` : '',
                  b.focusAreaNote
                ].filter(Boolean).join(' | '),
              };
            })
          };
        });

        setOrders(mappedOrders);
        console.log(`✅ [Dispatch] Fetched ${mappedOrders.length} bookings successfully:`, mappedOrders);
      }

    
    } catch (e) {
      console.error("❌ [Dispatch] Unexpected error in fetchData:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const handleCloseContext = () => setContextMenu(null);
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    if (contextMenu) document.addEventListener('mousedown', handleCloseContext);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('mousedown', handleCloseContext);
    };
  }, [dropdownOpen, contextMenu]);

  if (!mounted) return null;

if (!hasPermission('dispatch_board')) {
    return (
      <AppLayout title="Điều Phối">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  const pendingOrders = orders.filter(o => o.dispatchStatus === 'pending');
  const selectedOrder = orders.find(o => o.id === selectedOrderId) ?? null;

  const LEFT_TABS: { id: DispatchStatus; label: string; color: string; activeBg: string; dot: string; badgeBg: string; badgeText: string }[] = [
    { id: 'pending', label: 'Chờ điều phối', color: 'text-rose-600', activeBg: 'bg-rose-500', dot: 'bg-rose-500', badgeBg: 'bg-rose-100', badgeText: 'text-rose-700' },
    { id: 'dispatched', label: 'Đã điều phối', color: 'text-indigo-600', activeBg: 'bg-indigo-500', dot: 'bg-indigo-500', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700' },
    { id: 'in_progress', label: 'Đang làm', color: 'text-amber-600', activeBg: 'bg-amber-500', dot: 'bg-amber-500', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700' },
    { id: 'cleaning', label: 'Đang dọn', color: 'text-purple-600', activeBg: 'bg-purple-500', dot: 'bg-purple-500', badgeBg: 'bg-purple-100', badgeText: 'text-purple-700' },
    { id: 'waiting_rating', label: 'Chờ đánh giá', color: 'text-blue-600', activeBg: 'bg-blue-500', dot: 'bg-blue-500', badgeBg: 'bg-blue-100', badgeText: 'text-blue-700' },
    { id: 'done', label: 'Hoàn tất', color: 'text-emerald-600', activeBg: 'bg-emerald-500', dot: 'bg-emerald-500', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700' },
  ];

  const displayedOrders = orders.filter(o => {
    // 🚀 ĐỘC LẬP TRẠNG THÁI: Một đơn có thể xuất hiện ở nhiều tab nếu cần
    if (leftPanelTab === 'cleaning') {
      // Hiện trong tab Dọn dẹp nếu status là COMPLETED HOẶC vẫn còn KTV đang gán (chưa release)
      return o.rawStatus === 'COMPLETED' || o.hasAssignedKtv;
    }
    if (leftPanelTab === 'waiting_rating') {
      // Chỉ hiện trong tab Chờ đánh giá nếu status của Khách là FEEDBACK
      return o.rawStatus === 'FEEDBACK';
    }
    if (leftPanelTab === 'done') {
      // Chỉ hiện trong tab Hoàn tất nếu Khách đã DONE VÀ KTV đã được giải phóng (hết dọn phòng)
      return o.rawStatus === 'DONE' && !o.hasAssignedKtv;
    }
    // Các trạng thái khác (pending, dispatched, in_progress) dùng logic so khớp trực tiếp
    return o.dispatchStatus === leftPanelTab;
  });

  const updateOrder = (orderId: string, patchFn: (o: PendingOrder) => PendingOrder) => {
    setOrders(prev => prev.map(o => o.id === orderId ? patchFn(o) : o));
  };

  const updateSvcField = (orderId: string, svcId: string, patch: Partial<ServiceBlock>) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId ? { ...s, ...patch } : s),
    }));
  };

  const autoAlignStaffRow = (order: PendingOrder, svcId: string, rowId: string, ktvId: string, roomTransitionTime: number): PendingOrder => {
    let lastEndTime = '';
    let lastRoomId = '';
    
    // Tìm segment cuối cùng của KTV này CÓ TRƯỚC hàng hiện tại
    for (const svc of order.services) {
      for (const r of svc.staffList) {
        if (r.id === rowId) break; 
        if (r.ktvId === ktvId && r.segments.length > 0) {
          const lastSeg = r.segments[r.segments.length - 1];
          lastEndTime = lastSeg.endTime;
          lastRoomId = lastSeg.roomId || '';
        }
      }
      if (svc.id === svcId) break;
    }

    if (!lastEndTime) return order;

    const cloned = JSON.parse(JSON.stringify(order)) as PendingOrder;
    const targetSvc = cloned.services.find(s => s.id === svcId);
    const targetRow = targetSvc?.staffList.find(r => r.id === rowId);
    
    if (targetRow && targetRow.segments.length > 0) {
      const firstSeg = targetRow.segments[0];
      const isSameRoom = lastRoomId === firstSeg.roomId;
      const gap = isSameRoom ? 0 : roomTransitionTime;
      
      const start = calcEndTime(lastEndTime, gap);
      firstSeg.startTime = start;
      firstSeg.endTime = calcEndTime(start, firstSeg.duration);
      
      for(let i = 1; i < targetRow.segments.length; i++) {
         const p = targetRow.segments[i-1];
         const c = targetRow.segments[i];
         const g = p.roomId === c.roomId ? 0 : roomTransitionTime;
         c.startTime = calcEndTime(p.endTime, g);
         c.endTime = calcEndTime(c.startTime, c.duration);
      }
    }
    
    return cloned;
  };

  const updateStaffRow = (orderId: string, svcId: string, rowId: string, patch: Partial<StaffAssignment>) => {
    updateOrder(orderId, o => {
      let updatedOrder = {
        ...o,
        services: o.services.map(s => s.id === svcId
          ? { ...s, staffList: s.staffList.map(r => r.id === rowId ? { ...r, ...patch } : r) }
          : s
        ),
      };

      // Tự động nối giờ nếu KTV được chọn và đã có phục vụ chặng trước đó
      if (patch.ktvId) {
        updatedOrder = autoAlignStaffRow(updatedOrder, svcId, rowId, patch.ktvId, roomTransitionTime);
      }

      return updatedOrder;
    });
  };

  const addStaffRow = (orderId: string, svcId: string) => {
    const svc = orders.find(o => o.id === orderId)?.services.find(s => s.id === svcId);
    const st = getCurrentTime();
    const dur = svc?.duration ?? DEFAULT_DURATION;
    const newRow: StaffAssignment = {
      id: genId(),
      ktvId: '',
      ktvName: '',
      segments: [{
        id: `seg-${genId()}`,
        roomId: null,
        bedId: null,
        startTime: st,
        duration: dur,
        endTime: calcEndTime(st, dur)
      }],
      noteForKtv: '',
    };
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, staffList: [...s.staffList, newRow] }
        : s
      ),
    }));
  };

  const removeStaffRow = (orderId: string, svcId: string, rowId: string) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, staffList: s.staffList.filter(r => r.id !== rowId) }
        : s
      ),
    }));
  };

  const isDispatchReady = (order: PendingOrder): boolean =>
    order.services.every(s =>
      s.staffList.length > 0 &&
      s.staffList.every(r => 
        r.ktvId !== '' && 
        r.segments.length > 0 &&
        r.segments.every(seg => seg.roomId !== null && seg.bedId !== null && seg.startTime !== '')
      )
    );

  const getMissingInfo = (order: PendingOrder): string[] => {
    const missing: string[] = [];
    order.services.forEach((s, i) => {
      s.staffList.forEach((r, j) => {
        const prefix = `Dịch vụ ${i + 1} · KTV ${j + 1}`;
        if (!r.ktvId) missing.push(`${prefix}: Chưa chọn KTV`);
        r.segments.forEach((seg, k) => {
            const segPrefix = `${prefix} · Chặng ${k + 1}`;
            if (!seg.roomId) missing.push(`${segPrefix}: Chưa chọn Phòng`);
            if (!seg.bedId) missing.push(`${segPrefix}: Chưa chọn Giường`);
            if (!seg.startTime) missing.push(`${segPrefix}: Chưa nhập giờ bắt đầu`);
        });
      });
    });
    return missing;
  };

  const addServiceBlock = (svcName: string, duration: number) => {
    if (!selectedOrderId) return;
    const now = new Date();
    const startTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newBlock: ServiceBlock = {
      id: `svc-${genId()}`,
      serviceName: svcName,
      duration,
      selectedRoomId: null,
      bedId: null,
      staffList: [{ 
        id: `sr-${genId()}`, 
        ktvId: '', 
        ktvName: '', 
        segments: [{
            id: `seg-${genId()}`,
            roomId: null,
            bedId: null,
            startTime,
            duration,
            endTime: calcEndTime(startTime, duration)
        }],
        noteForKtv: '' 
      }],
      adminNote: '',
      genderReq: '',
      strength: '',
      focus: '',
      avoid: '',
      customerNote: '',
    };
    setOrders(prev => prev.map(o =>
      o.id === selectedOrderId ? { ...o, services: [...o.services, newBlock] } : o
    ));
    setShowAddSvcModal(false);
  };

  const removeServiceBlock = (orderId: string, svcId: string) => {
    if (!confirm('Xác nhận xóa dịch vụ này khỏi đơn?')) return;
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, services: o.services.filter(s => s.id !== svcId) } : o
    ));
  };
  const handleDispatch = async () => {
    if (!selectedOrder) return;
    const missing = getMissingInfo(selectedOrder);
    if (missing.length > 0) {
      alert(`⚠️ Vui lòng điền đầy đủ thông tin:\n\n${missing.map(m => `• ${m}`).join('\n')}`);
      return;
    }

    try {
      const clonedOrder = JSON.parse(JSON.stringify(selectedOrder)) as PendingOrder;

      const allStaffAssignments = [];
      const techCodesSet = new Set<string>();

      for (const svc of clonedOrder.services) {
        for (const row of svc.staffList) {
          if (!row.ktvId) continue;
          
          const ktvId = row.ktvId;
          techCodesSet.add(ktvId); 

          const currentTurn = turns.find(t => t.employee_id === ktvId);
          if (!currentTurn) continue;

          let turnsCompleted = currentTurn.turns_completed;
          let queuePos = currentTurn.queue_position;

          if (currentTurn.current_order_id !== selectedOrder.id) {
            turnsCompleted += 1;
            const currentMax = Math.max(...turns.map(t => t.queue_position), 0);
            const addedCount = allStaffAssignments.length; 
            queuePos = currentMax + addedCount + 1;
          }
          
          // Với đa chặng, TurnQueue theo chặng đầu tiên
          const firstSeg = row.segments[0];
          const lastSeg = row.segments[row.segments.length - 1];

          allStaffAssignments.push({
            ktvId,
            bookingItemId: svc.id,
            roomId: firstSeg.roomId,
            bedId: firstSeg.bedId,
            turnsCompleted,
            queuePos,
            startTime: firstSeg.startTime,
            endTime: lastSeg.endTime 
          });
        }
      }

      // ✅ Gộp assignments cùng KTV (1 KTV + 2 DV) → lưu tất cả item IDs
      const mergedAssignments: typeof allStaffAssignments = [];
      const ktvMap = new Map<string, typeof allStaffAssignments[0]>();
      for (const a of allStaffAssignments) {
        const existing = ktvMap.get(a.ktvId);
        if (existing) {
          // Gộp: nối bookingItemId, lấy endTime muộn nhất
          existing.bookingItemId = `${existing.bookingItemId},${a.bookingItemId}`;
          if (a.endTime > (existing.endTime || '')) existing.endTime = a.endTime;
        } else {
          ktvMap.set(a.ktvId, { ...a });
        }
      }
      mergedAssignments.push(...ktvMap.values());

      const combinedTechCodes = Array.from(techCodesSet).join(', ');
      
      const primaryService = clonedOrder.services[0];
      const primaryStaff = primaryService?.staffList[0];
      const primarySeg = primaryStaff?.segments[0];
      
      const itemUpdates = clonedOrder.services.map(svc => {
          // Lưu toàn bộ lộ trình của tất cả KTV trong dịch vụ này
          const allSegments = svc.staffList.flatMap(r => 
            r.segments.map(seg => ({ ...seg, ktvId: r.ktvId }))
          );

          return {
              id: svc.id,
              // Lấy room/bed riêng cho service này từ segment đầu tiên của nó
              roomName: allSegments[0]?.roomId || primarySeg?.roomId, 
              bedId: allSegments[0]?.bedId || primarySeg?.bedId,
              technicianCodes: svc.staffList.map(r => r.ktvId).filter(Boolean),
              status: 'PREPARING', 
              segments: allSegments,
              options: {
                  note: svc.customerNote?.split(' | ')[0] || '', 
                  therapist: svc.genderReq,
                  strength: svc.strength,
                  focus: svc.focus.split(',').map(f => f.trim()).filter(Boolean),
                  avoid: svc.avoid.split(',').map(a => a.trim()).filter(Boolean),
                  noteForKtv: svc.staffList?.[0]?.noteForKtv || '',
                  notesForKtvs: Object.fromEntries(
                      svc.staffList
                          .filter(r => r.ktvId && r.noteForKtv)
                          .map(r => [r.ktvId, r.noteForKtv])
                  )
              }
          };
      });

      const res = await processDispatch(clonedOrder.id, {
        status: 'PREPARING',
        technicianCode: combinedTechCodes,
        bedId: primarySeg?.bedId || null,
        roomName: primarySeg?.roomId || null,
        staffAssignments: mergedAssignments,
        date: selectedDate,
        notes: primaryService?.adminNote || '',
        itemUpdates: itemUpdates
      });

      if (res.success) {
        setOrders(prev => prev.map(o =>
          o.id === clonedOrder.id ? { ...o, dispatchStatus: 'dispatched' } : o
        ));
        setSelectedOrderId(null);
        setLeftPanelTab('dispatched');
        fetchData();
      } else {
        alert('Lỗi khi điều phối: ' + res.error);
      }
    } catch (err) {
      alert('Đã có lỗi bất ngờ xảy ra.');
      console.error(err);
    }
  };


  const handleCancelBooking = async (orderId: string) => {
    if (!confirm('Bạn có chắc chắn muốn HỦY đơn hàng này không?')) return;
    try {
      const res = await cancelBooking(orderId, selectedDate);
      if (res.success) {
        setOrders(prev => prev.filter(o => o.id !== orderId));
        if (selectedOrderId === orderId) setSelectedOrderId(null);
        setContextMenu(null);
      } else {
        alert('Lỗi khi hủy đơn: ' + res.error);
      }
    } catch (err) {
      alert('Lỗi hệ thống khi hủy đơn.');
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    let confirmMsg = `Xác nhận cập nhật trạng thái đơn hàng này?`;
    if (newStatus === 'COMPLETED') {
      confirmMsg = `Xác nhận HOÀN THÀNH dịch vụ? Khách hàng sẽ được chuyển sang kiểm tra đồ → đánh giá.`;
    } else if (newStatus === 'DONE') {
      confirmMsg = `Xác nhận HOÀN TẤT TOÀN BỘ đơn hàng và giải phóng KTV?`;
    }
    
    if (!confirm(confirmMsg)) return;
    try {
      const res = await updateBookingStatus(orderId, newStatus, selectedDate);
      if (res.success) {
        // Cập nhật local state hoặc refetch
        setOrders(prev => prev.filter(o => o.id !== orderId));
        if (selectedOrderId === orderId) setSelectedOrderId(null);
        setContextMenu(null);
        fetchData();
      } else {
        alert(`Lỗi khi cập nhật trạng thái: ${res.error}`);
      }
    } catch (err) {
      alert('Lỗi hệ thống khi cập nhật trạng thái.');
    }
  };

  const handleCreateQuickBooking = async (data: { customerName: string; customerPhone: string; customerEmail: string; serviceId: string; customerLang: string }) => {
    try {
      const res = await createQuickBooking({
        ...data,
        bookingDate: selectedDate
      });
      if (res.success) {
        fetchData();
        setShowAddOrderModal(false);
      } else {
        alert('Lỗi khi tạo đơn: ' + res.error);
      }
    } catch (err) {
      alert('Lỗi hệ thống khi tạo đơn.');
    }
  };

  const renderSoundToggle = () => {
    const hasUnread = notifications.some(n => !n.isRead);

    return (
      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            if (soundEnabled) {
              setSoundEnabled(false);
              return;
            }

            unlockAudio();

            if (push.permission === 'denied') {
              alert('Bạn đã chặn thông báo trên trình duyệt. Hãy bấm vào biểu tượng Ổ khóa trên thanh địa chỉ để "Cho phép" thông báo nhé!');
              return;
            }

            if (push.permission === 'default') {
              const success = await push.subscribe();
              if (success) setSoundEnabled(true);
              return;
            }

            setSoundEnabled(true);
          }}
          disabled={push.isRegistering}
          className={`w-11 h-11 rounded-full transition-all shadow-sm border flex items-center justify-center
            ${soundEnabled
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'
              : (push.permission === 'denied' ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100')}`}
          title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
        >
          <motion.div
            animate={soundEnabled && hasUnread ? {
              rotate: [0, -15, 15, -15, 15, 0],
              transition: { repeat: Infinity, duration: 0.5 }
            } : {}}
          >
            {push.isRegistering ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : soundEnabled ? (
              <div className="relative">
                <Bell size={20} />
                {hasUnread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 border-2 border-emerald-50 rounded-full" />}
              </div>
            ) : (
              <BellOff size={20} />
            )}
          </motion.div>
        </button>
      </div>
    );
  };
  return (
    <AppLayout title="Điều Phối">
      <div className="h-[calc(100dvh-3.5rem)] lg:h-[calc(100vh-3rem)] flex flex-col overflow-hidden" style={{ overscrollBehaviorY: 'contain' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4 shrink-0 mb-2 lg:mb-4 px-1 lg:px-0 mt-1 sm:mt-0">
          <div className="hidden lg:flex items-center justify-between sm:block">
            <div>
              <h1 className="text-xl lg:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                <span className="hidden lg:inline">Bảng Điều Phối Trung Tâm</span>
                <div className="hidden sm:flex items-center gap-1 ml-4 bg-gray-100/80 p-1 rounded-xl shadow-inner border border-gray-200">
                  <button
                    onClick={() => setActiveMode('DISPATCH')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeMode === 'DISPATCH'
                        ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/50'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <LayoutList size={14} /> Điều Phối
                  </button>
                  <button
                    onClick={() => setActiveMode('MONITOR')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeMode === 'MONITOR'
                        ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/50'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Columns3 size={14} /> Giám Sát Đơn
                  </button>
                </div>
              </h1>
              <p className="text-[10px] lg:text-xs text-gray-500 mt-1 font-medium hidden sm:block">{activeMode === 'DISPATCH' ? 'Điều phối KTV & Phòng chuyên nghiệp' : 'Theo dõi tiến trình phục vụ đơn hàng'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar ml-auto">
            {renderSoundToggle()}

            <div className="relative flex-shrink-0 group">
              <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 z-10" />
              <div className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm font-black bg-white shadow-sm flex items-center gap-1 min-w-[90px] group-hover:border-emerald-200 transition-colors">
                <span className="text-slate-800 tracking-tighter">
                  {new Date(selectedDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }).replace('/', '-')}
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
              />
            </div>

            <button 
              onClick={() => setShowAddOrderModal(true)}
              className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-black text-sm transition-all shadow-lg shadow-indigo-200 active:scale-95"
            >
              <Plus size={20} strokeWidth={4} /> <span className="hidden sm:inline">Thêm Đơn</span><span className="sm:hidden">Thêm</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-5 overflow-hidden pb-4 sm:pb-0">
          {activeMode === 'DISPATCH' ? (
            <>
          {/* LEFT: Order Panel */}
          <div className={`${selectedOrderId ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 flex-1 lg:flex-none shrink-0 flex-col border border-gray-200 bg-white rounded-3xl shadow-sm transition-all min-h-0 overflow-hidden`}>
            <div className="p-4 border-b border-gray-100 bg-white shrink-0">
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(v => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-2xl transition-all"
                >
                  <span className={`w-3 h-3 rounded-full shrink-0 ${LEFT_TABS.find(t => t.id === leftPanelTab)?.dot}`} />
                  <span className="flex-1 text-left">
                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Trạng thái</span>
                    <span className={`text-sm font-black ${LEFT_TABS.find(t => t.id === leftPanelTab)?.color}`}>
                      {LEFT_TABS.find(t => t.id === leftPanelTab)?.label}
                    </span>
                  </span>
                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-white border border-gray-200 shadow-sm">{displayedOrders.length}</span>
                  <ChevronDown size={18} className={`text-gray-400 transition-transform duration-300 ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full mt-2 left-0 right-0 z-30 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-y-auto max-h-64"
                    >
                      {LEFT_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => { setLeftPanelTab(tab.id); setDropdownOpen(false); }}
                          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-indigo-50/50 text-left border-b border-gray-50 last:border-0 transition-colors"
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${tab.dot}`} />
                          <span className={`flex-1 text-sm font-black ${leftPanelTab === tab.id ? tab.color : 'text-gray-700'}`}>
                            {tab.label}
                          </span>
                          {leftPanelTab === tab.id && <CheckCircle2 size={16} className="text-indigo-600" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50">
              {displayedOrders.length > 0 ? (
                displayedOrders.map(order => (
                  <motion.div
                    layout
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    onContextMenu={(e: React.MouseEvent) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, orderId: order.id });
                    }}
                    className={`bg-white p-5 rounded-3xl border-2 cursor-pointer transition-all active:scale-[0.98] relative ${selectedOrderId === order.id ? 'border-indigo-600 shadow-2xl shadow-indigo-100 ring-4 ring-indigo-50/50' : 'border-transparent shadow-sm hover:border-indigo-100 hover:shadow-lg'}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg tracking-wider">#{order.billCode}</span>
                      <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5"><Clock size={12} className="text-gray-300" /> {order.time}</span>
                    </div>
                    <div className="flex justify-between items-baseline gap-2">
                      <p className="font-black text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight truncate">{order.customerName}</p>
                        <div className="shrink-0 text-[11px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl flex items-center gap-1 border border-emerald-100/50">
                          <span>{(order.totalAmount || 0).toLocaleString('vi-VN')}đ</span>
                          <span className="opacity-30">·</span>
                          <span>{order.paymentMethod === 'Cash' || order.paymentMethod === 'cash_vnd' ? 'cash' : (order.paymentMethod === 'Transfer' ? 'ck' : order.paymentMethod)}</span>
                        </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-4">
                      <p className="text-[10px] text-gray-500 font-medium truncate flex-1 leading-tight">
                        {order.services.length > 0 
                          ? `${order.services.map(s => s.serviceName || 'Dịch vụ').join(', ')} · ${order.services.reduce((acc, s) => acc + (s.duration || 0), 0)}p`
                          : 'Chưa có dịch vụ'
                        }
                      </p>
                      {selectedOrderId === order.id && <span className="shrink-0 text-[10px] font-black text-indigo-600 uppercase tracking-tighter">Đang chọn →</span>}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60 py-10">
                  <Package className="mb-3 opacity-20" size={40} />
                  <p className="text-xs font-black uppercase tracking-widest italic">Trống</p>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Assignment Panel */}
          <div className={`${selectedOrderId ? 'flex' : 'hidden lg:flex'} flex-1 flex flex-col border border-gray-200 bg-white rounded-3xl overflow-hidden shadow-sm min-w-0 min-h-0 transition-all`}>
            <div className="p-4 lg:p-5 border-b border-gray-100 bg-white shrink-0 flex items-center gap-3">
              {selectedOrderId && (
                <button 
                  onClick={() => setSelectedOrderId(null)}
                  className="lg:hidden p-2 -ml-2 hover:bg-gray-100 rounded-xl text-gray-400"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              {selectedOrder ? (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                    <h2 className="font-black text-gray-900 text-base truncate">Đơn {selectedOrder.id} — {selectedOrder.customerName}</h2>
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5 ml-4">Đang trong quá trình điều phối</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-400">
                  <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center">
                    <Send size={20} className="opacity-50" />
                  </div>
                  <p className="text-sm font-black uppercase tracking-widest italic">Chọn đơn hàng để tiếp tục</p>
                </div>
              )}
            </div>

            {selectedOrder ? (
              <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 bg-slate-50/30">
                {selectedOrder.services.map((svc, idx) => {
                  // 🚩 LOGIC: Xác định các giường đang bận
                  // 1. Giường bận do đơn hàng khác (đang làm hoặc đang dọn)
                  const busyInOtherOrders = orders
                    .filter(o => o.id !== selectedOrder.id && (o.dispatchStatus === 'in_progress' || o.dispatchStatus === 'cleaning' || o.dispatchStatus === 'dispatched'))
                    .flatMap(o => o.services.flatMap(s => s.staffList.flatMap(r => r.segments.map(seg => seg.bedId))))
                    .filter(Boolean) as string[];

                  // 2. Giường bận do DV KHÁC trong cùng đơn — nhưng CHO PHÉP nếu cùng KTV
                  const currentSvcKtvIds = svc.staffList.map(r => r.ktvId).filter(Boolean);
                  const busyInCurrentOrder = selectedOrder.services
                    .filter(s => s.id !== svc.id)
                    .flatMap(s => s.staffList
                      .filter(r => !currentSvcKtvIds.includes(r.ktvId)) // Cùng KTV → cho chung giường
                      .flatMap(r => r.segments.map(seg => seg.bedId)))
                    .filter(Boolean) as string[];

                  const allBusyBedIds = [...new Set([...busyInOtherOrders, ...busyInCurrentOrder])];

                  // ✅ Cho phép 1 KTV gán cho nhiều DV trong cùng đơn (1KH + 2DV + 1KTV)

                  return (
                    <DispatchServiceBlock
                      key={svc.id}
                      svc={svc}
                      svcIndex={idx}
                      orderId={selectedOrder.id}
                      rooms={rooms}
                      beds={beds}
                      busyBedIds={allBusyBedIds}
                      usedKtvIds={[]}
                      availableTurns={turns}
                      onUpdateSvc={updateSvcField}
                      onUpdateStaff={updateStaffRow}
                      onAddStaff={addStaffRow}
                      onRemoveStaff={removeStaffRow}
                      onRemoveSvc={removeServiceBlock}
                      selectedDate={selectedDate}
                    />
                  );
                })}

                <button
                  onClick={() => setShowAddSvcModal(true)}
                  className="w-full py-4 border-2 border-dashed border-gray-200 rounded-3xl text-sm font-black text-gray-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-white transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <Plus size={18} strokeWidth={3} /> THÊM DỊCH VỤ KHÁC
                </button>

                <div className="pt-4 sticky bottom-0 bg-gradient-to-t from-white via-white/90 to-transparent pb-2 mt-auto">
                  <button
                    onClick={handleDispatch}
                    disabled={!isDispatchReady(selectedOrder)}
                    className={`w-full py-5 rounded-3xl font-black text-sm lg:text-base tracking-widest uppercase transition-all flex items-center justify-center gap-3 shadow-2xl ${isDispatchReady(selectedOrder)
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 active:scale-95'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                      }`}
                  >
                    <Send size={20} strokeWidth={3} /> XÁC NHẬN ĐIỀU PHỐI
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6 border border-gray-100 shadow-inner">
                  <Send size={40} className="text-gray-200" />
                </div>
                <h3 className="text-lg font-black text-gray-300 uppercase tracking-[0.2em]">Trình Điều Phối</h3>
                <p className="text-sm text-gray-400 mt-2 font-medium max-w-[200px]">Vui lòng chọn một đơn hàng từ danh sách bên trái để bắt đầu sắp xếp KTV và Phòng</p>
              </div>
            )}
          </div>
            </>
          ) : (
            <KanbanBoard 
              orders={orders} 
              onUpdateStatus={handleUpdateStatus} 
              onOpenDetail={(id) => {
                setSelectedOrderId(id);
                setActiveMode('DISPATCH');
              }}
              selectedOrderId={selectedOrderId}
            />
          )}

        </div>
      </div>

      {/* Add Svc Modal */}
      <AnimatePresence>
        {showAddSvcModal && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
              onClick={() => setShowAddSvcModal(false)} 
            />
            <motion.div 
              initial={{ y: '100%', opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative bg-white rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h3 className="font-black text-gray-900 text-lg uppercase tracking-tight">Thêm dịch vụ</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Chọn từ danh mục phổ biến</p>
                </div>
                <button 
                  onClick={() => setShowAddSvcModal(false)}
                  className="p-3 hover:bg-gray-100 rounded-2xl text-gray-400 transition-colors"
                >
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>
              <div className="p-6 grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto no-scrollbar pb-10 sm:pb-6">
                {QUICK_SERVICES_LIST.map(svc => (
                  <button 
                    key={svc.name} 
                    onClick={() => addServiceBlock(svc.name, svc.duration)} 
                    className="group p-5 text-left border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center justify-between active:scale-[0.98]"
                  >
                    <div>
                      <p className="font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{svc.name}</p>
                      <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-widest">{svc.duration} PHÚT</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                      <Plus size={20} strokeWidth={3} />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Context Menu for Cancellation */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-[100] bg-white rounded-2xl shadow-2xl border border-gray-100 p-1.5 min-w-[180px] overflow-hidden"
          >
            {/* Các nút chức năng dựa trên trạng thái */}
            {(() => {
              const order = orders.find(o => o.id === contextMenu.orderId);
              if (!order) return null;

              if (order.dispatchStatus === 'in_progress') {
                return (
                  <button
                    onClick={() => handleUpdateStatus(contextMenu.orderId, 'COMPLETED')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-amber-600 hover:bg-amber-50 rounded-xl transition-colors font-black text-xs uppercase tracking-wider border-b border-gray-50 mb-1"
                  >
                    <CheckCircle2 size={18} />
                    Hoàn thành & Dọn phòng
                  </button>
                );
              }
              if (order.dispatchStatus === 'cleaning' || order.dispatchStatus === 'waiting_rating') {
                return (
                  <button
                    onClick={() => handleUpdateStatus(contextMenu.orderId, 'COMPLETED')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors font-black text-xs uppercase tracking-wider border-b border-gray-50 mb-1"
                  >
                    <CheckCircle2 size={18} />
                    Hoàn tất → Kiểm tra đồ & Đánh giá
                  </button>
                );
              }
              return null;
            })()}

            {/* QR Journey button */}
            <button
              onClick={() => {
                const order = orders.find(o => o.id === contextMenu.orderId);
                if (order) {
                  setQrModal({ orderId: order.id, billCode: order.billCode, accessToken: order.accessToken, customerLang: order.customerLang });
                }
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors font-black text-xs uppercase tracking-wider border-b border-gray-50 mb-1"
            >
              <QrCode size={18} />
              Hiện QR Journey
            </button>

            <button
              onClick={() => handleCancelBooking(contextMenu.orderId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors font-black text-xs uppercase tracking-wider"
            >
              <Trash2 size={18} />
              Hủy đơn hàng này
            </button>
            <button
              onClick={() => setContextMenu(null)}
              className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-50 rounded-xl transition-colors font-bold text-xs uppercase tracking-wider"
            >
              Đóng menu
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Journey Modal */}
      <AnimatePresence>
        {qrModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setQrModal(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center"
            >
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <QrCode size={28} className="text-indigo-600" />
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-1">QR Journey</h3>
              <p className="text-xs text-gray-500 font-medium mb-6">Đơn #{qrModal.billCode} — Khách quét để xem lộ trình</p>
              
              <div className="bg-gray-50 rounded-2xl p-6 mb-6 inline-block border border-gray-100">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(`${JOURNEY_BASE_URL}/${qrModal.customerLang || 'vi'}/journey/${qrModal.accessToken || qrModal.orderId}`)}`}
                  alt="QR Journey"
                  width={QR_SIZE}
                  height={QR_SIZE}
                  className="mx-auto"
                />
              </div>

              <button
                onClick={() => setQrModal(null)}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-colors text-sm uppercase tracking-wider"
              >
                Đóng
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AddOrderModal
        isOpen={showAddOrderModal}
        onClose={() => setShowAddOrderModal(false)}
        services={allServices}
        onConfirm={handleCreateQuickBooking}
        selectedDate={selectedDate}
      />

    </AppLayout>
  );
}
