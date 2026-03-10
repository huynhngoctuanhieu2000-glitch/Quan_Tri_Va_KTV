'use client';

// 🔧 UI CONFIGURATION
const DEFAULT_DURATION = 60; // Phút mặc định cho mỗi KTV

import React, { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import {
  ShieldAlert, Clock, CheckCircle2, Bell, BellOff,
  Plus, Calendar as CalendarIcon, Send, Phone,
  ChevronDown, ChevronLeft, Package, Volume2, VolumeX, Trash2, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { DispatchServiceBlock } from './_components/DispatchServiceBlock';
import { getDispatchData, processDispatch, cancelBooking, updateBookingStatus, createQuickBooking } from './actions';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { AddOrderModal } from './_components/AddOrderModal';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface StaffAssignment {
  id: string; // Internal mapping ID
  ktvId: string;
  ktvName: string;
  startTime: string;
  duration: number;
  endTime: string;
  noteForKtv: string;
}

export interface ServiceBlock {
  id: string; // BookingItem ID
  serviceName: string;
  serviceDescription?: string;
  duration: number;
  selectedRoomId: string | null;
  bedId: string | null;
  staffList: StaffAssignment[];
  adminNote: string;
  genderReq: string;
  strength: string;
  focus: string;
  avoid: string;
  customerNote: string;
}

export type DispatchStatus = 'pending' | 'dispatched' | 'in_progress' | 'cleaning' | 'waiting_rating' | 'done';

export interface PendingOrder {
  id: string; // Booking ID
  billCode: string;
  customerName: string;
  phone: string;
  time: string;
  services: ServiceBlock[];
  dispatchStatus: DispatchStatus;
  createdAt: string;
  totalAmount?: number;
  paymentMethod?: string;
  rawStatus?: string;
  hasAssignedKtv?: boolean;
}

export type StaffData = {
  id: string;
  full_name: string;
  status: string;
  gender: string;
  skills: Record<string, string>;
  phone: string;
  position: string;
  avatar_url: string;
  experience: string;
};

export type TurnQueueData = {
  id?: string;
  employee_id: string;
  date: string;
  queue_position: number;
  check_in_order: number;
  status: 'waiting' | 'working' | 'done_turn';
  turns_completed: number;
  current_order_id?: string | null;
  estimated_end_time?: string | null;
};

export interface StaffNotification {
  id: string;
  bookingId: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

// MOCK DATA REMOVED - Using real data from Supabase

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const calcEndTime = (start: string, duration: number): string => {
  if (!start || !duration) return '';
  const [h, m] = start.split(':').map(Number);
  const end = new Date();
  end.setHours(h, m + duration, 0, 0);
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
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<DispatchStatus>('pending');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAddSvcModal, setShowAddSvcModal] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [staffNotifications, setStaffNotifications] = useState<StaffNotification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const push = usePushNotifications(user?.id);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, orderId: string } | null>(null);

  // Synchronize sound with push permission on load
  useEffect(() => {
    if (push.permission !== 'granted') {
      setSoundEnabled(false);
    } else {
      setSoundEnabled(true);
    }
  }, [push.permission]);

  const lastSoundTimeRef = useRef<number>(0);
  const playNotificationSound = (source: string, type?: string) => {
    const now = Date.now();
    // Tránh phát âm thanh quá gần nhau (trong vòng 3s) để không bị lặp
    // Exception: EMERGENCY sound always plays if enabled
    if (type !== 'EMERGENCY' && now - lastSoundTimeRef.current < 3000) return;
    
    console.log(`🔔 [Dispatch] Playing sound from ${source}...`);
    // Use a more urgent sound for Emergency if available, otherwise default
    const soundFile = type === 'EMERGENCY' ? '/sounds/emergency-alert.wav' : '/sounds/reception-notification.wav';
    const audio = new Audio(soundFile);
    audio.play()
      .then(() => { lastSoundTimeRef.current = now; })
      .catch(err => {
         console.error("🔇 [Dispatch] Audio play failed, trying fallback...", err);
         if (type === 'EMERGENCY') {
            const fallback = new Audio('/sounds/reception-notification.wav');
            fallback.play().catch(e => console.error("Fallback audio failed too"));
         }
      });
  };

  // 📡 Realtime Subscriptions
  useEffect(() => {
    setMounted(true);
    fetchData();

    const channel = supabase
      .channel('dispatch_board_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Bookings' }, (payload) => {
        console.log("🔄 [Dispatch] Realtime: Bookings changed", payload.eventType);
        if (payload.eventType === 'INSERT' && soundEnabled) {
           playNotificationSound('Realtime (Booking)');
        }
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'TurnQueue' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'StaffNotifications' }, (payload) => {
        console.log("🔔 [Dispatch] Realtime: New Staff Notification RECEIVED", payload);
        const newNotif = payload.new as StaffNotification;
        if (!newNotif || !newNotif.id) {
          console.error("❌ [Dispatch] Realtime: Empty or invalid notification payload", payload);
          return;
        }
        setStaffNotifications(prev => {
          // Tránh trùng lặp nếu query fetch chạy cùng lúc
          if (prev.some(p => p.id === newNotif.id)) return prev;
          return [newNotif, ...prev];
        });
        if (soundEnabled) {
           playNotificationSound('Realtime (Staff)', newNotif.type);
        }
      })
      .on('system', { event: '*', schema: 'public', table: 'StaffNotifications' }, (payload) => {
        console.log("📡 [Dispatch] Realtime: System event", payload);
      })
      .subscribe((status) => {
        console.log("📡 [Dispatch] Realtime: Subscription status:", status);
      });

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, soundEnabled]); // Thêm soundEnabled vào deps để ref luôn mới nhất nếu cần

  const [loadingStaff, setLoadingStaff] = useState(true);
  const prevPendingCountRef = useRef<number>(0);
  const isFirstLoadRef = useRef<boolean>(true);

  // 🔊 Audio Notification Logic - Backup & Reliable
  useEffect(() => {
    if (!mounted) return;
    const currentPendingCount = orders.filter(o => o.dispatchStatus === 'pending').length;
    
    // Nếu là lần đầu tiên dữ liệu được load, không kêu chuông mà chỉ cập nhật count
    if (isFirstLoadRef.current) {
        if (orders.length > 0 || !loading) {
            prevPendingCountRef.current = currentPendingCount;
            isFirstLoadRef.current = false;
            console.log("ℹ️ [Dispatch] Initial data loaded, skipping sound.");
        }
        return;
    }

    // Nếu số lượng đơn tăng mà Realtime callback chưa phát âm thanh (hoặc bị sót)
    if (currentPendingCount > prevPendingCountRef.current && soundEnabled) {
      playNotificationSound('State Observer (Backup)');
    }
    
    prevPendingCountRef.current = currentPendingCount;
  }, [orders, soundEnabled, mounted, loading]);

  const fetchData = async () => {
    setLoading(true);
    setLoadingStaff(true);
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
        setLoadingStaff(false);
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
      console.log(`✅ [Dispatch] Loaded ${rData.length} rooms and ${bdData.length} beds`);

        // 4. Set Bookings
      if (bData) {
        const mappedOrders: PendingOrder[] = (bData as any[]).filter(b => b.status !== 'CANCELLED').map(b => {
          // Tìm tất cả KTV đang được gán cho đơn này trong TurnQueue
          const assignedTurns = tData?.filter((t: any) => t.current_order_id === b.id) || [];
          const hasAssignedKtv = assignedTurns.length > 0;

          let dStatus: DispatchStatus = 'pending';
          if (b.status === 'CONFIRMED' || b.status === 'PREPARING') dStatus = 'dispatched';
          else if (b.status === 'IN_PROGRESS') dStatus = 'in_progress';
          else if (b.status === 'FEEDBACK') dStatus = 'waiting_rating';
          else if (b.status === 'COMPLETED' || hasAssignedKtv) dStatus = 'cleaning';
          else if (b.status === 'DONE') dStatus = 'done';
          
          return {
            id: b.id,
            billCode: b.billCode || 'N/A',
            customerName: b.customerName || 'Khách vãng lai',
            phone: b.customerPhone || '',
            time: b.timeBooking || (b.createdAt ? b.createdAt.substring(11, 16) : '--:--'),
            dispatchStatus: dStatus,
            createdAt: b.createdAt || new Date().toISOString(),
            totalAmount: b.totalAmount || 0,
            paymentMethod: b.paymentMethod || 'Chưa rõ',
            rawStatus: b.status,
            hasAssignedKtv,
            services: (b.BookingItems || []).map((bi: any) => {
              // Đối với mỗi service, chúng ta có thể gán nhiều KTV. 
              // Hiện tại trong UI, staffList nằm trong khối service.
              // Nếu đơn đã được điều phối, ta lấy danh sách KTV từ TurnQueue.
              
              // GIẢ ĐỊNH: Nếu có nhiều KTV và nhiều dịch vụ, ta gán tất cả KTV cho dịch vụ đầu tiên
              // để hiển thị đủ danh sách. Trong thực tế, có thể cần mapping phức tạp hơn.
              const isFirstService = (b.BookingItems || []).indexOf(bi) === 0;
              
              const staffList = (assignedTurns.length > 0 && isFirstService) 
                ? assignedTurns.map((t: any) => {
                    const staff = (sData as StaffData[])?.find((s: any) => s.id === t.employee_id);
                    return {
                      id: `st-${bi.id}-${t.employee_id}`,
                      ktvId: t.employee_id,
                      ktvName: staff?.full_name || 'KTV',
                      startTime: b.timeBooking || (b.createdAt ? b.createdAt.substring(11, 16) : '--:--'),
                      duration: bi.duration ?? 0,
                      endTime: t.estimated_end_time || '',
                      noteForKtv: bi.options?.noteForKtv || ''
                    };
                  })
                : [{
                    id: `st-${bi.id}`,
                    ktvId: '',
                    ktvName: '',
                    startTime: b.timeBooking || (b.createdAt ? b.createdAt.substring(11, 16) : '--:--'),
                    duration: bi.duration ?? 0,
                    endTime: '',
                    noteForKtv: ''
                  }];

              return {
                id: bi.id,
                serviceName: bi.serviceName || bi.service_name || 'Dịch vụ',
                serviceDescription: bi.serviceDescription || bi.service_description || '',
                duration: Number(bi.duration) || 0,
                selectedRoomId: b.roomName || null,
                bedId: b.bedId || null,
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

        // 5. Fetch Unread Staff Notifications
        const { data: notifs, error: nError } = await supabase
            .from('StaffNotifications')
            .select('*')
            .eq('isRead', false)
            .order('createdAt', { ascending: false })
            .limit(20);
        
        if (nError) {
          console.error("❌ [Dispatch] Error fetching StaffNotifications:", nError);
        } else if (notifs) {
          console.log(`🔔 [Dispatch] Fetched ${notifs.length} unread staff notifications`);
          setStaffNotifications(notifs as StaffNotification[]);
        }
      }

    } catch (e) {
      console.error("❌ [Dispatch] Unexpected error in fetchData:", e);
    } finally {
      setLoading(false);
      setLoadingStaff(false);
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

  const renderStaffNotifications = () => {
    const unread = staffNotifications.filter(n => !n.isRead);
    if (unread.length > 0) {
      console.log(`🎨 [Dispatch] Rendering ${unread.length} notifications...`);
    }
    return (
      <div className="fixed top-20 right-6 z-[99999] flex flex-col gap-3 pointer-events-none">
         <AnimatePresence>
            {unread.map((n) => {
               console.log(`📦 [Dispatch] Rendering single item: ${n.id} - ${n.type}`);
               return (
                 <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.7}
                    onDragEnd={async (_, info) => {
                       if (Math.abs(info.offset.x) > 100) {
                          setStaffNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: true } : item));
                          await supabase.from('StaffNotifications').update({ isRead: true }).eq('id', n.id);
                       }
                    }}
                    className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border min-w-[320px] max-w-sm flex gap-4 items-start cursor-grab active:cursor-grabbing
                      ${n.type === 'EMERGENCY' 
                        ? 'bg-rose-600 border-rose-500 text-white' 
                        : 'bg-white/95 backdrop-blur-md border-emerald-100'}`}
                 >
                    <div className={`mt-1 p-2 rounded-xl flex-shrink-0 
                       ${n.type === 'EMERGENCY' ? 'bg-white/20' : 'bg-emerald-50 text-emerald-600'}`}>
                       {n.type === 'EMERGENCY' ? <ShieldAlert size={24} className="animate-pulse" /> : <Bell size={20} />}
                    </div>
                    <div className="flex-1">
                       <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5
                          ${n.type === 'EMERGENCY' ? 'text-rose-100' : 'text-emerald-600'}`}>
                          KTV Yêu cầu hỗ trợ
                       </p>
                       <p className={`text-sm font-bold leading-tight ${n.type === 'EMERGENCY' ? 'text-white' : 'text-slate-800'}`}>
                          {n.message}
                       </p>
                       <p className={`text-[10px] mt-2 font-medium opacity-60 ${n.type === 'EMERGENCY' ? 'text-rose-100' : 'text-slate-400'}`}>
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </p>
                    </div>
                    <button 
                       onClick={async () => {
                          setStaffNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: true } : item));
                          await supabase.from('StaffNotifications').update({ isRead: true }).eq('id', n.id);
                       }}
                       className="p-1 hover:bg-black/5 rounded-lg transition-colors"
                    >
                       <X size={18} className={n.type === 'EMERGENCY' ? 'text-white' : 'text-slate-400'} />
                    </button>
                 </motion.div>
               );
            })}
         </AnimatePresence>
      </div>
    );
  };

  if (!hasPermission('dispatch_board')) {
    return (
      <AppLayout>
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

  const selectRoom = (orderId: string, svcId: string, roomId: string) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, selectedRoomId: s.selectedRoomId === roomId ? null : roomId, bedId: null }
        : s
      ),
    }));
  };

  const selectBed = (orderId: string, svcId: string, bedId: string) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, bedId: s.bedId === bedId ? null : bedId }
        : s
      ),
    }));
  };

  const updateStaffRow = (orderId: string, svcId: string, rowId: string, patch: Partial<StaffAssignment>) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, staffList: s.staffList.map(r => r.id === rowId ? { ...r, ...patch } : r) }
        : s
      ),
    }));
  };

  const addStaffRow = (orderId: string, svcId: string) => {
    const svc = orders.find(o => o.id === orderId)?.services.find(s => s.id === svcId);
    const lastRow = svc?.staffList[svc.staffList.length - 1];
    const newRow: StaffAssignment = {
      id: genId(),
      ktvId: '',
      ktvName: '',
      startTime: lastRow?.startTime ?? '',
      duration: svc?.duration ?? DEFAULT_DURATION,
      endTime: lastRow?.endTime ?? '',
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
      s.bedId !== null &&
      s.staffList.length > 0 &&
      s.staffList.every(r => r.ktvId !== '' && r.startTime !== '')
    );

  const getMissingInfo = (order: PendingOrder): string[] => {
    const missing: string[] = [];
    order.services.forEach((s, i) => {
      if (!s.selectedRoomId) missing.push(`Dịch vụ ${i + 1}: Chưa chọn Phòng`);
      else if (!s.bedId) missing.push(`Dịch vụ ${i + 1}: Chưa chọn Giường`);
      s.staffList.forEach((r, j) => {
        if (!r.ktvId) missing.push(`Dịch vụ ${i + 1} · KTV ${j + 1}: Chưa chọn KTV`);
        if (!r.startTime) missing.push(`Dịch vụ ${i + 1} · KTV ${j + 1}: Chưa nhập giờ bắt đầu`);
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
      staffList: [{ id: `sr-${genId()}`, ktvId: '', ktvName: '', startTime, duration, endTime: calcEndTime(startTime, duration), noteForKtv: '' }],
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
  const handleDispatch = async () => {
    if (!selectedOrder) return;
    const missing = getMissingInfo(selectedOrder);
    if (missing.length > 0) {
      alert(`⚠️ Vui lòng điền đầy đủ thông tin:\n\n${missing.map(m => `• ${m}`).join('\n')}`);
      return;
    }

    try {
      const allStaffAssignments = [];
      const techCodesSet = new Set<string>();

      for (const svc of selectedOrder.services) {
        for (const row of svc.staffList) {
          if (!row.ktvId) continue;
          
          const ktvId = row.ktvId;
          techCodesSet.add(ktvId); // Thu thập tất cả mã KTV duy nhất

          const currentTurn = turns.find(t => t.employee_id === ktvId);
          if (!currentTurn) continue;

          let turnsCompleted = currentTurn.turns_completed;
          let queuePos = currentTurn.queue_position;

          if (currentTurn.current_order_id !== selectedOrder.id) {
            turnsCompleted += 1;
            // Tính toán queuePos mới: Lấy max hiện tại trong state + số người đã được xử lý trong vòng lặp này
            const currentMax = Math.max(...turns.map(t => t.queue_position), 0);
            const addedCount = allStaffAssignments.length; 
            queuePos = currentMax + addedCount + 1;
          }
          
          allStaffAssignments.push({
            ktvId,
            turnsCompleted,
            queuePos,
            endTime: row.endTime
          });
        }
      }

      // Tạo chuỗi mã KTV phân cách bằng dấu phẩy để lưu vào Bookings.technicianCode
      const combinedTechCodes = Array.from(techCodesSet).join(', ');
      
      const primaryService = selectedOrder.services[0];
      
      // Thu thập tất cả các ghi chú cho KTV từ các item
      const itemUpdates = selectedOrder.services.map(svc => {
          // Lấy options hiện tại từ dữ liệu thô (bookings được fetch về)
          // Tìm lại item gốc trong state orders để lấy thông tin
          const order = orders.find(o => o.id === selectedOrder.id);
          const service = order?.services.find(s => s.id === svc.id);
          
          // Vì chúng ta không lưu 'options' thô vào ServiceBlock, 
          // chúng ta cần bóc tách các giá trị quan trọng để tái cấu trúc lại options
          return {
              id: svc.id,
              options: {
                  note: svc.customerNote?.split(' | ')[0] || '', // Ghi chú của khách
                  therapist: svc.genderReq,
                  strength: svc.strength,
                  focus: svc.focus.split(',').map(f => f.trim()).filter(Boolean),
                  avoid: svc.avoid.split(',').map(a => a.trim()).filter(Boolean),
                  noteForKtv: svc.staffList?.[0]?.noteForKtv || '' // Lưu ghi chú cho KTV
              }
          };
      });

      const res = await processDispatch(selectedOrder.id, {
        status: 'CONFIRMED',
        technicianCode: combinedTechCodes,
        bedId: primaryService?.bedId || null,
        roomName: primaryService?.selectedRoomId || null,
        staffAssignments: allStaffAssignments,
        date: selectedDate,
        notes: primaryService?.adminNote || '', // Lưu ghi chú điều phối vào Bookings.notes
        itemUpdates: itemUpdates
      });

      if (res.success) {
        setOrders(prev => prev.map(o =>
          o.id === selectedOrder.id ? { ...o, dispatchStatus: 'dispatched' } : o
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
    const statusLabel = newStatus === 'DONE' ? 'HOÀN TẤT' : newStatus;
    if (!confirm(`Xác nhận ${statusLabel} đơn hàng này?`)) return;
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

  const handleCreateQuickBooking = async (data: { customerName: string; customerPhone: string; serviceId: string }) => {
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
    return (
      <button
        onClick={async () => {
          if (soundEnabled) {
            setSoundEnabled(false);
            return;
          }

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
        className={`flex-shrink-0 px-4 py-2.5 rounded-2xl transition-all shadow-sm border flex items-center gap-2.5 font-black text-xs
          ${soundEnabled 
            ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' 
            : (push.permission === 'denied' ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100')}`}
      >
        <div className="relative">
          {push.isRegistering ? (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : soundEnabled ? (
            <Bell size={20} className="animate-bounce" />
          ) : (
            <BellOff size={20} />
          )}
          {soundEnabled && <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full border-2 border-emerald-50" />}
        </div>
        <span className="whitespace-nowrap uppercase tracking-tight">
          {push.isRegistering ? 'Đang kết nối...' : soundEnabled ? 'Thông báo: BẬT' : 'Thông báo: TẮT'}
        </span>
      </button>
    );
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3rem)] flex flex-col overflow-hidden" style={{ overscrollBehaviorY: 'contain' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 mb-6 px-1 lg:px-0">
          <div className="flex items-center justify-between sm:block">
            <div>
              <h1 className="text-xl lg:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                <span className="lg:hidden">Điều Phối</span>
                <span className="hidden lg:inline">Bảng Điều Phối Trung Tâm</span>
                <div className="hidden sm:flex items-center gap-1.5">
                  {LEFT_TABS.map(tab => (
                    <button 
                      key={tab.id} 
                      title={tab.label}
                      onClick={() => setLeftPanelTab(tab.id)}
                      className={`
                        ${tab.badgeBg} ${tab.badgeText} 
                        w-6 h-6 lg:w-7 lg:h-7 
                        flex items-center justify-center 
                        rounded-full font-black text-[10px] lg:text-xs 
                        border border-current border-opacity-20 shadow-sm 
                        transition-all hover:scale-110 active:scale-95 
                        cursor-pointer
                      `}
                    >
                      {orders.filter(o => o.dispatchStatus === tab.id).length}
                    </button>
                  ))}
                </div>
                <span className="sm:hidden bg-gray-100 text-gray-600 text-[10px] px-2 py-1 rounded-full font-black">
                  {orders.length} TỔNG
                </span>
              </h1>
              <p className="text-[10px] lg:text-xs text-gray-500 mt-1 font-medium hidden sm:block">Điều phối KTV & Phòng chuyên nghiệp</p>
            </div>
            {/* Mobile quick actions toggle or sound could go here */}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {renderSoundToggle()}

            <div className="relative flex-shrink-0">
              <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none bg-white cursor-pointer min-w-[140px]"
              />
            </div>

            <button 
              onClick={() => setShowAddOrderModal(true)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-black text-sm transition-all shadow-lg shadow-indigo-100 active:scale-95"
            >
              <Plus size={18} strokeWidth={3} /> <span className="hidden sm:inline">Tạo Đơn Mới</span><span className="sm:hidden">Thêm</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-5 overflow-hidden">
          {/* LEFT: Order Panel */}
          <div className={`${selectedOrderId ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 shrink-0 flex-col border border-gray-200 bg-white rounded-3xl shadow-sm transition-all`}>
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, orderId: order.id });
                    }}
                    className={`bg-white p-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.98] relative ${selectedOrderId === order.id ? 'border-indigo-600 shadow-xl shadow-indigo-100 ring-4 ring-indigo-50' : 'border-transparent shadow-sm hover:border-indigo-200 hover:shadow-md'}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg tracking-wider">#{order.billCode}</span>
                      <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5"><Clock size={12} className="text-gray-300" /> {order.time}</span>
                    </div>
                    <div className="flex justify-between items-baseline gap-2">
                      <p className="font-black text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight truncate">{order.customerName}</p>
                      {order.totalAmount !== undefined && order.totalAmount > 0 && (
                        <div className="shrink-0 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <span>{order.totalAmount.toLocaleString('vi-VN')}đ</span>
                          <span className="opacity-30">·</span>
                          <span>{order.paymentMethod === 'Cash' ? 'TM' : (order.paymentMethod === 'Transfer' ? 'CK' : order.paymentMethod)}</span>
                        </div>
                      )}
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
          <div className={`${selectedOrderId ? 'flex' : 'hidden lg:flex'} flex-1 flex flex-col border border-gray-200 bg-white rounded-3xl overflow-hidden shadow-sm min-w-0 transition-all`}>
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
                    .flatMap(o => o.services.map(s => s.bedId))
                    .filter(Boolean) as string[];

                  // 2. Giường bận do dịch vụ khác TRONG CÙNG BILL
                  const busyInCurrentOrder = selectedOrder.services
                    .filter(s => s.id !== svc.id)
                    .map(s => s.bedId)
                    .filter(Boolean) as string[];

                  const allBusyBedIds = [...new Set([...busyInOtherOrders, ...busyInCurrentOrder])];

                  return (
                    <DispatchServiceBlock
                      key={svc.id}
                      svc={svc}
                      svcIndex={idx}
                      orderId={selectedOrder.id}
                      rooms={rooms}
                      beds={beds}
                      busyBedIds={allBusyBedIds}
                      availableTurns={turns}
                      onUpdateSvc={updateSvcField}
                      onSelectRoom={selectRoom}
                      onSelectBed={selectBed}
                      onUpdateStaff={updateStaffRow}
                      onAddStaff={addStaffRow}
                      onRemoveStaff={removeStaffRow}
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

              if (order.dispatchStatus === 'in_progress' || order.dispatchStatus === 'cleaning') {
                return (
                  <button
                    onClick={() => handleUpdateStatus(contextMenu.orderId, 'DONE')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors font-black text-xs uppercase tracking-wider border-b border-gray-50 mb-1"
                  >
                    <CheckCircle2 size={18} />
                    Hoàn tất đơn này
                  </button>
                );
              }
              return null;
            })()}

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
      <AddOrderModal
        isOpen={showAddOrderModal}
        onClose={() => setShowAddOrderModal(false)}
        services={allServices}
        onConfirm={handleCreateQuickBooking}
        selectedDate={selectedDate}
      />
      {renderStaffNotifications()}
    </AppLayout>
  );
}
