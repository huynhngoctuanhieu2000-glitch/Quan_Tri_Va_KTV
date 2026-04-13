import { useState, useEffect, useCallback, useRef } from 'react';
// Đã chuyển sang dùng REST API /api/ktv/... thay vì server actions trực tiếp
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export type ScreenState = 'DASHBOARD' | 'TIMER' | 'REVIEW' | 'REWARD' | 'HANDOVER';

// 🔧 DEFAULT PROCEDURES (Fallback when room has no config)
const DEFAULT_PREP_PROCEDURE = [
    'Vệ sinh máy lạnh & quạt',
    'Chuẩn bị tinh dầu & dụng cụ',
    'Setup giường (Khăn, gối)',
    'Chuẩn bị khăn nóng',
    'Kiểm tra vệ sinh phòng'
];
const DEFAULT_CLEAN_PROCEDURE = [
    'Thu gom khăn bẩn & rác',
    'Vệ sinh bồn bệ & dụng cụ',
    'Sắp xếp lại gối, nệm',
    'Xịt tinh dầu khử mùi'
];

// 🚩 ROOM ISSUE QUICK OPTIONS
export const ROOM_ISSUE_OPTIONS = [
    'Máy lạnh hư / rò nước',
    'Đèn cháy / hỏng',
    'Thiếu khăn / dụng cụ',
    'Mùi hôi / ẩm mốc',
    'Nghẹt nước / toilet',
    'Hỏng giường / nệm'
];

export interface DashboardConfig {
    initialAction?: string | null;
    targetBookingId?: string | null;
}

export function useKTVDashboard(config?: DashboardConfig) {
    const { user } = useAuth();
    const [screen, setScreen] = useState<ScreenState>('DASHBOARD');
    const [booking, setBooking] = useState<any>(null);
    const [showProcedure, setShowProcedure] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    // Dynamic checklist arrays (driven by room config from API)
    const [prepChecklist, setPrepChecklist] = useState<boolean[]>([]);
    const [cleanChecklist, setCleanChecklist] = useState<boolean[]>([]);
    const [showRoomIssueModal, setShowRoomIssueModal] = useState(false);

    // Derive procedure labels from booking data (fallback to defaults)
    const prepProcedure: string[] = booking?.roomPrepProcedure || DEFAULT_PREP_PROCEDURE;
    const cleanProcedure: string[] = booking?.roomCleanProcedure || DEFAULT_CLEAN_PROCEDURE;

    // Initialize checklist arrays when booking/procedures change
    useEffect(() => {
        setPrepChecklist(new Array(prepProcedure.length).fill(false));
    }, [booking?.id, prepProcedure.length]);
    useEffect(() => {
        setCleanChecklist(new Array(cleanProcedure.length).fill(false));
    }, [booking?.id, cleanProcedure.length]);

    const isChecklistComplete = prepChecklist.length > 0 && prepChecklist.every(Boolean);
    const isHandoverComplete = cleanChecklist.length > 0 && cleanChecklist.every(Boolean);

    // Legacy-compatible aliases for page.tsx
    const checklist = prepChecklist;
    const handoverChecklist = cleanChecklist;

    const [settings, setSettings] = useState<any>({
        ktv_setup_duration_minutes: 10,
        auto_finish_on_timer_end: true,
        ktv_commission_per_60min: 100000
    });
    const [prepTimeRemaining, setPrepTimeRemaining] = useState(0);
    const [isPrepping, setIsPrepping] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(60 * 60); 
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [commission, setCommission] = useState(0);
    const [bonusMessage, setBonusMessage] = useState<string | null>(null);
    const [hasSubmittedReview, setHasSubmittedReview] = useState(false);
    const [canStart, setCanStart] = useState(true);
    const [allowedStartTime, setAllowedStartTime] = useState<Date | null>(null);
    const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);

    const lastAcknowledgedIdRef = useRef<string | null>(null);
    const prevBookingIdRef = useRef<string | null>(null);
    const isFirstLoadRef = useRef<boolean>(true);
    const screenRef = useRef<ScreenState>(screen);
    const bookingRef = useRef<any>(null);
    const isPreppingRef = useRef<boolean>(false);
    const isTimerRunningRef = useRef<boolean>(false);
    const manualSegmentOverrideRef = useRef<boolean>(false);
    const handleFinishTimerRef = useRef<() => Promise<void>>(async () => {});

    useEffect(() => { screenRef.current = screen; }, [screen]);
    useEffect(() => { bookingRef.current = booking; }, [booking]);
    useEffect(() => { isPreppingRef.current = isPrepping; }, [isPrepping]);
    useEffect(() => { isTimerRunningRef.current = isTimerRunning; }, [isTimerRunning]);

    // 🔒 Start Lock Logic
    useEffect(() => {
        if (!booking) {
            setCanStart(true);
            setAllowedStartTime(null);
            return;
        }

        const calculateAllowedTime = () => {
            let allowed: Date | null = null;

            if (booking.dispatchStartTime) {
                // Quầy có nhập giờ bắt đầu (HH:mm)
                const [h, m] = String(booking.dispatchStartTime).split(':').map(Number);
                const d = new Date();
                d.setHours(h, m, 0, 0);
                allowed = d;
            } else if (booking.last_served_at) {
                // Quầy không nhập -> Dùng mốc điều phối + thời gian chuẩn bị
                const dispatchTime = new Date(booking.last_served_at).getTime();
                const setupMs = (settings.ktv_setup_duration_minutes || 10) * 60 * 1000;
                allowed = new Date(dispatchTime + setupMs);
            }

            setAllowedStartTime(allowed);

            if (!allowed) {
                setCanStart(true);
            } else {
                const now = new Date();
                // Cho phép lệch 5s để tránh vấn đề đồng bộ clock nhẹ
                setCanStart(now.getTime() >= (allowed.getTime() - 5000));
            }
        };

        calculateAllowedTime();
        const interval = setInterval(calculateAllowedTime, 1000); // Check mỗi giây để đếm ngược mượt
        return () => clearInterval(interval);
    }, [booking, settings.ktv_setup_duration_minutes]);

    // 🕒 Active Segment & Shifting Logic
    useEffect(() => {
        if (!booking || booking.status !== 'IN_PROGRESS') {
            if (!manualSegmentOverrideRef.current) setActiveSegmentIndex(0);
            return;
        }

        // Skip auto-calc khi KTV đã bấm chuyển chặng thủ công
        if (manualSegmentOverrideRef.current) return;

        const updateActiveSegment = () => {
            if (manualSegmentOverrideRef.current) return;

            // 1. Tìm dịch vụ được gán cho KTV này
            const allItemIds: string[] = booking.assignedItemIds?.length > 0
                ? booking.assignedItemIds
                : (booking.assignedItemId ? [booking.assignedItemId] : []);
            
            const allAssignedItems = allItemIds.length > 0
                ? booking.BookingItems?.filter((i: any) => allItemIds.includes(i.id)) || []
                : [booking.BookingItems?.find((i: any) => i.id === booking.assignedItemId) || booking.BookingItems?.[0]].filter(Boolean);

            if (allAssignedItems.length === 0) return;

            // 2. Gom tất cả segments của KTV này
            let allMySegs: any[] = [];
            for (const ai of allAssignedItems) {
                let segs: any[] = [];
                try {
                    segs = typeof ai?.segments === 'string' 
                        ? JSON.parse(ai.segments) 
                        : (Array.isArray(ai?.segments) ? ai.segments : []);
                } catch { segs = []; }
                
                const mySegs = segs.filter((seg: any) => 
                    seg.ktvId && user?.id && seg.ktvId.toLowerCase().includes(user.id.toLowerCase())
                );
                allMySegs.push(...mySegs);
            }

            if (allMySegs.length === 0) return;

            // 3. Tính toán lộ trình thực tế (Shifted Segments)
            let tStart = allAssignedItems[0]?.timeStart || booking.timeStart;
            if (!tStart) return;

            if (typeof tStart === 'string' && !tStart.includes('Z') && !tStart.includes('+')) {
                tStart = tStart.replace(' ', 'T') + 'Z';
            }
            const actualStartMs = new Date(tStart).getTime();
            const nowMs = new Date().getTime();

            let currentOffsetMs = 0;
            let foundIdx = 0;

            allMySegs.forEach((seg: any, idx: number) => {
                const segStartMs = actualStartMs + currentOffsetMs;
                if (nowMs >= segStartMs) {
                    foundIdx = idx;
                }
                currentOffsetMs += (seg.duration * 60 * 1000);
            });

            setActiveSegmentIndex(foundIdx);
        };

        updateActiveSegment();
        const interval = setInterval(updateActiveSegment, 10000);
        return () => clearInterval(interval);
    }, [booking]);

    // 📺 SCREEN TRANSITION ENGINE (Centralized)
    // 🔑 NGUYÊN TẮC: Mỗi KTV CHỈ quan tâm assignedItem.status (item-level)
    // booking.status chỉ dùng cho: CANCELLED, co-working sync (forward only)
    const STATUS_ORDER: Record<string, number> = {
        'PREPARING': 0, 'READY': 1, 'IN_PROGRESS': 2, 
        'COMPLETED': 3, 'FEEDBACK': 4, 'CLEANING': 5, 'DONE': 6
    };

    useEffect(() => {
        if (!booking) return;

        const assignedItem = booking.assignedItemId 
            ? booking.BookingItems?.find((i: any) => i.id === booking.assignedItemId)
            : booking.BookingItems?.[0];

        // Status item-level ưu tiên tuyệt đối
        let currentStatus = assignedItem?.status || booking.status;
        
        // Co-working sync: CHỈ cho tiến (PREPARING/READY → IN_PROGRESS), KHÔNG cho lùi
        if (booking.status === 'IN_PROGRESS' 
            && (currentStatus === 'PREPARING' || currentStatus === 'READY') 
            && assignedItem?.timeStart) {
            currentStatus = 'IN_PROGRESS';
        }

        const currentScreen = screenRef.current;
        const statusLevel = STATUS_ORDER[currentStatus] ?? -1;

        console.log("📟 [ScreenEngine] Final Check:", { currentStatus, itemStatus: assignedItem?.status, bookingStatus: booking.status, currentScreen, statusLevel });

        // 🚫 CANCELLED: luôn xử lý (booking-level)
        if (booking.status === 'CANCELLED') {
            setBooking(null);
            setScreen('DASHBOARD');
            return;
        }

        if (currentStatus === 'READY' && currentScreen === 'DASHBOARD') {
            const setupMs = (settings.ktv_setup_duration_minutes || 10) * 60;
            setPrepTimeRemaining(setupMs);
            setIsPrepping(true);
            setScreen('TIMER');
        } 
        else if (currentStatus === 'IN_PROGRESS') {
            // Guard: KHÔNG kéo ngược KTV đã hoàn thành (COMPLETED/CLEANING/DONE) về TIMER
            const postServiceScreens = ['REVIEW', 'HANDOVER', 'REWARD'];
            if (postServiceScreens.includes(currentScreen)) return;

            if (currentScreen !== 'TIMER' || isPreppingRef.current) {
                setScreen('TIMER');
                setIsPrepping(false);
            }
            setIsTimerRunning(true);
        }
        else if (currentStatus === 'CLEANING') {
            if (currentScreen !== 'HANDOVER' && currentScreen !== 'REWARD') {
                setHasSubmittedReview(true);
                setScreen('HANDOVER');
                setIsTimerRunning(false);
            }
        }
        else if (currentStatus === 'COMPLETED' || currentStatus === 'FEEDBACK') {
            if ((currentScreen === 'DASHBOARD' || currentScreen === 'TIMER') && !hasSubmittedReview) {
                setScreen('REVIEW');
                setIsTimerRunning(false);
            }
        }
        else if (currentStatus === 'DONE') {
            // 🔑 Mỗi KTV phải TỰ đi qua REVIEW → HANDOVER → REWARD
            // KHÔNG auto-release khi co-worker bấm dọn xong
            if ((currentScreen === 'DASHBOARD' || currentScreen === 'TIMER') && !hasSubmittedReview) {
                // KTV chưa review → chuyển REVIEW trước
                setScreen('REVIEW');
                setIsTimerRunning(false);
            }
            // Nếu KTV đang ở HANDOVER → handleFinishHandover sẽ tính commission và chuyển REWARD
            // → KHÔNG tự động chuyển ở đây
        }
    }, [booking, settings.ktv_setup_duration_minutes, hasSubmittedReview, user?.id]);

    // 🔊 Audio Notification Logic - Moved to NotificationProvider for consistency
    useEffect(() => {
        if (!isLoading && isFirstLoadRef.current) {
            prevBookingIdRef.current = booking?.id || null;
            isFirstLoadRef.current = false;
            return;
        }
        prevBookingIdRef.current = booking?.id || null;
    }, [booking, isLoading]);

    // ✨ Bonus Points logic - Sound handled by NotificationProvider
    useEffect(() => {
        if (!user?.id) return;

        const checkRewards = async () => {
            if (screenRef.current === 'TIMER') return;

            try {
                const response = await fetch(`/api/ktv/notifications?techCode=${user.id}`);
                const res = await response.json();
                
                if (res.success && res.data && res.data.length > 0) {
                    const notify = res.data[0];
                    setBonusMessage(notify.message);
                    
                    // Marks as read, sound is played by global NotificationProvider via Realtime
                    await fetch(`/api/ktv/notifications?id=${notify.id}`, { method: 'PATCH' });
                    
                    setTimeout(() => setBonusMessage(null), 15000);
                }
            } catch (err) {
                console.error('Error checking rewards:', err);
            }
        };

        // Check ngay khi load và khi trạng thái thay đổi sang IDLE
        checkRewards();

        // Realtime listener cho thông báo mới
        const channel = supabase
            .channel(`ktv_rewards_${user.id}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'StaffNotifications',
                filter: `employeeId=eq.${user.id}`
            }, () => {
                checkRewards();
            })
            .subscribe();

        const interval = setInterval(checkRewards, 60000); // Poll mỗi phút đề phòng realtime tạch

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, [user?.id, screen]);

    // ⚙️ Fetch Settings
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch('/api/ktv/settings');
                const res = await response.json();
                if (res.success) setSettings(res.data);
            } catch (err) { console.error('Error fetching settings:', err); }
        };
        fetchSettings();
    }, []);

    // 📡 Realtime & Polling Fetch
    useEffect(() => {
        if (!user?.id) return;

        const fetchBooking = async () => {
            try {
                if (!user?.id) return;

                // Mặc định: Lấy đơn đang gán cho KTV trong TurnQueue
                let url = `/api/ktv/booking?techCode=${user.id}`;
                
                // Nâng cao: Ưu tiên track đơn cũ khi đang ở màn hậu kỳ (REVIEW/HANDOVER/REWARD)
                const isPostService = ['REVIEW', 'HANDOVER', 'REWARD'].includes(screenRef.current);
                
                if (config?.targetBookingId) {
                    url = `/api/ktv/booking?bookingId=${config.targetBookingId}`;
                } else if (isPostService && prevBookingIdRef.current) {
                    // Ưu tiên fetch theo ID đơn vừa làm để tránh bị mất dữ liệu khi đã RELEASE_KTV
                    url = `/api/ktv/booking?bookingId=${prevBookingIdRef.current}`;
                    console.log("🔍 [KTV] Persisting booking fetch for post-service screen:", prevBookingIdRef.current);
                }
                // (Đã gộp vào logic ở trên)

                const response = await fetch(url);
                const res = await response.json();
                
                if (res.success && res.data) {
                    console.log("📡 [KTV] Fetch Success - ID:", res.data.id, "Status:", res.data.status, "Rating:", res.data.rating);
                    // IGNORE if this is the booking we just finished and acknowledged
                    if (res.data.id === lastAcknowledgedIdRef.current) {
                        setBooking(null);
                        return;
                    }

                    // Update state ONLY if data actually changed to avoid timer reset & sound spam
                    setBooking((prev: any) => {
                        const newRating = Number(res.data.rating || 0);
                        const oldRating = Number(prev?.rating || 0);
                        
                        const isNew = !prev || prev.id !== res.data.id;
                        
                        // 1. Tìm dịch vụ được gán cho KTV này
                        const assignedItem = res.data.assignedItemId 
                            ? res.data.BookingItems?.find((i: any) => i.id === res.data.assignedItemId)
                            : res.data.BookingItems?.[0];

                        // 🚀 Status item-level ưu tiên tuyệt đối + co-working forward-only sync
                        let currentStatus = assignedItem?.status || res.data.status;
                        if (res.data.status === 'IN_PROGRESS' 
                            && (currentStatus === 'PREPARING' || currentStatus === 'READY') 
                            && assignedItem?.timeStart) {
                            currentStatus = 'IN_PROGRESS';
                        }

                        // Debug log 
                        console.log(`[KTV] Assigned Item ID: ${assignedItem?.id}, Item Status: ${assignedItem?.status}, Booking Status: ${res.data.status}, Final Computed Status: ${currentStatus}`);

                        // Tính thời gian cho TẤT CẢ items được gán (multi-item support)
                        const allItemIds: string[] = res.data.assignedItemIds?.length > 0
                            ? res.data.assignedItemIds
                            : (res.data.assignedItemId ? [res.data.assignedItemId] : []);
                        const allAssignedItems = allItemIds.length > 0
                            ? res.data.BookingItems?.filter((i: any) => allItemIds.includes(i.id)) || []
                            : [assignedItem].filter(Boolean);
                        
                        // Tập hợp tất cả segments gán cho KTV này (theo thứ tự)
                        let allMySegs: any[] = [];
                        for (const ai of allAssignedItems) {
                            let segs: any[] = [];
                            try {
                                segs = typeof ai?.segments === 'string' 
                                    ? JSON.parse(ai.segments) 
                                    : (Array.isArray(ai?.segments) ? ai.segments : []);
                            } catch { segs = []; }
                            
                            const mySegs = segs.filter((seg: any) => 
                                seg.ktvId && user?.id && seg.ktvId.toLowerCase().includes(user.id.toLowerCase())
                            );
                            allMySegs.push(...mySegs);
                        }

                        // ------------- TÍNH TOÁN CHẶNG HIỆN TẠI NGAY TRONG FETCH -------------
                        let calculatedSegIdx = manualSegmentOverrideRef.current ? activeSegmentIndex : 0;
                        if (!manualSegmentOverrideRef.current && currentStatus === 'IN_PROGRESS' && res.data.timeStart) {
                            let tStart = res.data.timeStart;
                            if (typeof tStart === 'string' && !tStart.includes('Z') && !tStart.includes('+')) {
                                tStart = tStart.replace(' ', 'T') + 'Z';
                            }
                            const start = new Date(tStart).getTime();
                            const elapsedMins = (new Date().getTime() - start) / 60000;
                            let acc = 0;
                            for (let i = 0; i < allMySegs.length; i++) {
                                acc += allMySegs[i].duration;
                                // Nếu chưa xong chặng này
                                if (elapsedMins <= acc) { calculatedSegIdx = i; break; }
                            }
                        }
                        // Nếu đang PREPARING mà KTV check activeSegmentIndex > 0 (đã chạy trước đó)
                        if (currentStatus === 'PREPARING' && activeSegmentIndex > 0) {
                            calculatedSegIdx = activeSegmentIndex;
                        }
                        
                        // Cập nhật lại state index để UI đồng bộ
                        if (!manualSegmentOverrideRef.current && calculatedSegIdx !== activeSegmentIndex) {
                            setActiveSegmentIndex(calculatedSegIdx);
                        }

                        // Bỏ qua ROUTING MÀN HÌNH nội bộ vì useEffect gốc đã đảm đương việc này. Đồng thời tránh lỗi loop push về DASHBOARD khi READY.
                        
                        const isStatusChanged = prev?.currentStatus !== currentStatus;
                        const isRatingChanged = oldRating !== newRating;
                        
                        if (isNew || isStatusChanged || isRatingChanged || JSON.stringify(prev?.BookingItems) !== JSON.stringify(res.data.BookingItems)) {
                            // Lưu trạng thái tính toán vào object để so sánh lần sau
                            res.data.currentStatus = currentStatus;
                            
                            // Dùng duration của CHẶNG HIỆN TẠI (không phải tổng)
                            const currentSegDuration = allMySegs.length > 0
                                ? (Number(allMySegs[calculatedSegIdx]?.duration) || allMySegs.reduce((sum: number, seg: any) => sum + (Number(seg.duration) || 0), 0) || 60)
                                : (assignedItem?.duration || 60);
                            
                            console.log("⏱️ [Timer] calculatedSegIdx:", calculatedSegIdx, "segDuration:", currentSegDuration, "totalSegs:", allMySegs.length);

                            // Cập nhật thời gian dựa trên chặng hiện tại
                            const totalSecs = currentSegDuration * 60;
                            let tStart = assignedItem?.timeStart || res.data.timeStart;
                            
                            if (currentStatus === 'IN_PROGRESS' && tStart) {
                                if (typeof tStart === 'string' && !tStart.includes('Z') && !tStart.includes('+')) {
                                    tStart = tStart.replace(' ', 'T') + 'Z';
                                }
                                const start = new Date(tStart).getTime();
                                const now = new Date().getTime();
                                const elapsed = Math.floor((now - start) / 1000);
                                // Nếu đã override chặng thủ công, KHÔNG ghi đè timer
                                if (!manualSegmentOverrideRef.current) {
                                    // 🔧 TÍNH LẠI ELAPSED THEO CHẶNG: trừ đi thời gian của các chặng trước
                                    let previousSegsDuration = 0;
                                    for(let i=0; i < calculatedSegIdx; i++) {
                                        previousSegsDuration += (allMySegs[i]?.duration || 0);
                                    }
                                    const adjustedElapsed = elapsed - (previousSegsDuration * 60);
                                    setTimeRemaining(Math.max(0, totalSecs - adjustedElapsed));
                                }
                            } else if (!isTimerRunningRef.current) {
                                // Chỉ reset timer khi CHƯA chạy (tránh nhảy số khi đang đếm ngược)
                                setTimeRemaining(totalSecs);
                            }

                            return res.data;
                        }
                        return prev;
                    });
                } else if (res.success && !res.data) {
                    // Chỉ xóa booking khỏi state nếu KHÔNG phải màn hình hậu kỳ
                    const isPostService = ['REVIEW', 'HANDOVER', 'REWARD'].includes(screenRef.current);
                    if (!isPostService) {
                        setBooking(null);
                    } else {
                        console.log("🕯️ [KTV] Booking released from DB, but keeping UI for cleanup...");
                    }
                }
            } catch (err) {
                console.error('Error fetching booking:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchBooking();

        // Subscribe to real-time changes
        const channel = supabase
            .channel(`ktv_realtime_${user.id}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'Bookings',
                filter: booking?.id ? `id=eq.${booking.id}` : undefined
            }, (payload: any) => {
                console.log("🔄 [KTV] Realtime Booking Update:", payload.new.status);
                
                // Nếu đơn hàng bị hủy → set ngay
                if (payload.new.status === 'CANCELLED') {
                    setBooking(null);
                    setScreen('DASHBOARD');
                    return;
                }

                // 🚀 KHÔNG set partial data cho bất kỳ status nào có liên quan đến BookingItems
                // Partial spread gây ra booking.status mới + BookingItems.status cũ → Screen Engine sai
                // Chỉ fetchBooking() để lấy data hoàn chỉnh, nhất quán
                fetchBooking();
            })
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'BookingItems'
            }, (payload: any) => {
                const currentBooking = bookingRef.current;
                if (!currentBooking) return;
                
                // Chỉ xử lý event cho item được gán cho KTV này
                // Co-working: 2 KTV cùng gán 1 BookingItem → cả 2 nhận event
                // Khác DV: mỗi KTV chỉ nhận event của item mình
                const myItemId = currentBooking.assignedItemId || currentBooking.BookingItems?.[0]?.id;
                if (payload.new.id !== myItemId) return;
                
                console.log("🔄 [KTV] Realtime BookingItem Sync:", payload.new.id, payload.new.status);
                setBooking((prev: any) => {
                    if (!prev) return prev;
                    const items = prev.BookingItems?.map((i: any) => i.id === payload.new.id ? { ...i, ...payload.new } : i) || [];
                    return { ...prev, BookingItems: items };
                });
                
                fetchBooking();
            })
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'TurnQueue',
                filter: `employee_id=eq.${user.id}`
            }, (payload: any) => {
                console.log("🔄 [KTV] Realtime TurnQueue change:", payload.eventType);
                fetchBooking();
            })
            .subscribe();

        // Polling fallback (mỗi 5 giây) để đảm bảo đồng bộ cực nhanh nếu Realtime có độ trễ
        const intervalId = setInterval(fetchBooking, 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(intervalId);
        };
    }, [user?.id, booking?.id, booking?.assignedItemId, isTimerRunning, isPrepping]); // Added assignedItemId and isPrepping to re-bind filter

    // ⏱️ Timer countdown only — NO side effects inside setState
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isPrepping && prepTimeRemaining > 0) {
            timer = setInterval(() => {
                setPrepTimeRemaining(prev => {
                    if (prev <= 1) {
                        setIsPrepping(false);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else if (isTimerRunning && timeRemaining > 0) {
            timer = setInterval(() => {
                setTimeRemaining(prev => (prev <= 1 ? 0 : prev - 1));
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isPrepping, prepTimeRemaining, isTimerRunning, timeRemaining]);

    // 📱 BACKGROUND RECOVERY: Khi KTV mở lại app sau khi tắt màn hình / chuyển app khác
    // Browser mobile sẽ freeze setInterval → timer bị dừng.
    // Fix: dùng visibilitychange + focus → tính lại timeRemaining từ server timeStart.
    useEffect(() => {
        const recalcTimerFromServer = () => {
            const currentBooking = bookingRef.current;
            if (!currentBooking || !isTimerRunningRef.current) return;

            const assignedItem = currentBooking.assignedItemId 
                ? currentBooking.BookingItems?.find((i: any) => i.id === currentBooking.assignedItemId)
                : currentBooking.BookingItems?.[0];
            
            let tStart = assignedItem?.timeStart || currentBooking.timeStart;
            if (!tStart) return;

            if (typeof tStart === 'string' && !tStart.includes('Z') && !tStart.includes('+')) {
                tStart = tStart.replace(' ', 'T') + 'Z';
            }

            // Lấy tất cả segments gán cho KTV
            const allItemIds: string[] = currentBooking.assignedItemIds?.length > 0
                ? currentBooking.assignedItemIds
                : (currentBooking.assignedItemId ? [currentBooking.assignedItemId] : []);
            const allItems = allItemIds.length > 0
                ? currentBooking.BookingItems?.filter((i: any) => allItemIds.includes(i.id)) || []
                : [assignedItem].filter(Boolean);
            
            let allMySegs: any[] = [];
            for (const ai of allItems) {
                let segs: any[] = [];
                try {
                    segs = typeof ai?.segments === 'string' ? JSON.parse(ai.segments) : (Array.isArray(ai?.segments) ? ai.segments : []);
                } catch { segs = []; }
                const mySegs = segs.filter((seg: any) => seg.ktvId && user?.id && seg.ktvId.toLowerCase().includes(user.id.toLowerCase()));
                allMySegs.push(...mySegs);
            }

            const segIdx = activeSegmentIndex;
            const currentSegDuration = allMySegs.length > 0
                ? (Number(allMySegs[segIdx]?.duration) || allMySegs.reduce((sum: number, seg: any) => sum + (Number(seg.duration) || 0), 0) || 60)
                : (assignedItem?.duration || 60);

            const totalSecs = currentSegDuration * 60;
            const start = new Date(tStart).getTime();
            const now = new Date().getTime();
            const elapsed = Math.floor((now - start) / 1000);

            // Trừ đi thời gian các chặng trước
            let previousSegsDuration = 0;
            for (let i = 0; i < segIdx; i++) {
                previousSegsDuration += (allMySegs[i]?.duration || 0);
            }
            const adjustedElapsed = elapsed - (previousSegsDuration * 60);
            const newRemaining = Math.max(0, totalSecs - adjustedElapsed);

            console.log(`📱 [BackgroundRecovery] Recalculated timer: ${newRemaining}s remaining (elapsed: ${adjustedElapsed}s)`);
            setTimeRemaining(newRemaining);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                recalcTimerFromServer();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', recalcTimerFromServer);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', recalcTimerFromServer);
        };
    }, [activeSegmentIndex, user?.id]);

    // 🏁 Auto-finish: trigger khi timer đạt 0 (tách riêng khỏi countdown để React xử lý đúng)
    useEffect(() => {
        if (isTimerRunning && !isPrepping && timeRemaining === 0) {
            console.log('🏁 [AutoFinish] Timer reached 0, calling handleFinishTimer...');
            handleFinishTimerRef.current();
        }
    }, [timeRemaining, isTimerRunning, isPrepping]);

    const toggleChecklist = (index: number) => {
        setPrepChecklist(prev => prev.map((v, i) => i === index ? !v : v));
    };

    const toggleHandoverChecklist = (index: number) => {
        setCleanChecklist(prev => prev.map((v, i) => i === index ? !v : v));
    };

    const checkAllChecklist = () => {
        setPrepChecklist(prev => prev.map(() => true));
    };

    const checkAllHandoverChecklist = () => {
        setCleanChecklist(prev => prev.map(() => true));
    };

    // 🚩 Room Issue Report
    const handleReportRoomIssue = async (issues: string[], note: string) => {
        if (!booking || !user?.id) return;
        setIsLoading(true);
        try {
            const roomId = booking.assignedRoomId || booking.roomName || 'N/A';
            const issueText = issues.length > 0 ? issues.join(', ') : '';
            const fullMessage = `🚩 BÁO SỰ CỐ PHÒNG ${roomId} — KTV ${user.id}: ${issueText}${note ? ` | ${note}` : ''}`;

            await fetch('/api/ktv/interaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: booking.id,
                    type: 'EMERGENCY',
                    techCode: user.id,
                    message: fullMessage
                })
            });
            setShowRoomIssueModal(false);
            alert('Đã gửi báo cáo sự cố về Lễ tân!');
        } catch (err) {
            console.error('Error reporting room issue:', err);
            alert('Lỗi gửi báo cáo!');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmSetup = async () => {
        if (!booking || !user?.id || !booking.assignedItemId) return;
        
        setIsLoading(true);
        // Cập nhật trạng thái Item lên Server để đồng bộ cho các KTV khác cùng làm dịch vụ này
        const response = await fetch('/api/ktv/booking', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                bookingId: booking.id, 
                status: 'READY',
                techCode: user.id 
            })
        });
        
        const res = await response.json();
        if (res.success) {
            const assignedItem = booking.BookingItems?.find((i: any) => i.id === booking.assignedItemId) || booking.BookingItems?.[0];

            // Lấy segments gán cho KTV này
            const allItemIds: string[] = booking.assignedItemIds?.length > 0
                ? booking.assignedItemIds
                : (booking.assignedItemId ? [booking.assignedItemId] : []);
            const allItems = allItemIds.length > 0
                ? booking.BookingItems?.filter((i: any) => allItemIds.includes(i.id)) || []
                : [assignedItem].filter(Boolean);
            
            let allMySegs: any[] = [];
            for (const ai of allItems) {
                let segs: any[] = [];
                try {
                    segs = typeof ai?.segments === 'string' ? JSON.parse(ai.segments) : (Array.isArray(ai?.segments) ? ai.segments : []);
                } catch { segs = []; }
                const mySegs = segs.filter((seg: any) => seg.ktvId && user.id && seg.ktvId.toLowerCase().includes(user.id.toLowerCase()));
                allMySegs.push(...mySegs);
            }

            // Dùng duration của chặng đầu tiên (không phải tổng duration)
            const firstSegDuration = allMySegs.length > 0
                ? (Number(allMySegs[0].duration) || 60)
                : (assignedItem?.duration || 60);
            
            setTimeRemaining(firstSegDuration * 60);
            setPrepTimeRemaining(settings.ktv_setup_duration_minutes * 60);
            setIsPrepping(true);
            setScreen('TIMER');
        } else {
            alert('Lỗi xác nhận chuẩn bị: ' + (res.error || 'Unknown error'));
        }
        setIsLoading(false);
    };

    const handleStartTimer = async () => {
        if (!booking || !user?.id) return;
        setIsLoading(true);
        const response = await fetch('/api/ktv/booking', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                bookingId: booking.id, 
                status: 'IN_PROGRESS',
                techCode: user.id,
                action: activeSegmentIndex > 0 ? 'RESUME_TIMER' : 'START_TIMER'
            })
        });
        const res = await response.json();
        if (res.success) {
            setIsTimerRunning(true);
        } else {
            console.error('❌ [KTV Logic] Start error:', res.error);
            alert('Lỗi cập nhật trạng thái: ' + (res.error || 'Unknown error'));
        }
        setIsLoading(false);
    };

    const handleFinishTimer = async () => {
        if (!booking || !user?.id) return;

        // Lấy tất cả segments của KTV này (multi-item support)
        const allItemIds: string[] = booking.assignedItemIds?.length > 0
            ? booking.assignedItemIds
            : (booking.assignedItemId ? [booking.assignedItemId] : []);
        const allItems = allItemIds.length > 0
            ? booking.BookingItems?.filter((i: any) => allItemIds.includes(i.id)) || []
            : [booking.BookingItems?.[0]].filter(Boolean);
        
        let allMySegs: any[] = [];
        for (const ai of allItems) {
            let segs: any[] = [];
            try {
                segs = typeof ai?.segments === 'string' ? JSON.parse(ai.segments) : (Array.isArray(ai?.segments) ? ai.segments : []);
            } catch { segs = []; }
            const mySegs = segs.filter((seg: any) => seg.ktvId && user.id && seg.ktvId.toLowerCase().includes(user.id.toLowerCase()));
            allMySegs.push(...mySegs);
        }

        const totalSegs = allMySegs.length;
        const currentIdx = activeSegmentIndex;

        // 🚩 Nếu còn chặng tiếp → chuyển sang chặng mới, reset timer
        if (totalSegs > 1 && currentIdx < totalSegs - 1) {
            const nextIdx = currentIdx + 1;
            const currentSeg = allMySegs[currentIdx];
            const nextSeg = allMySegs[nextIdx];
            const nextDuration = Number(nextSeg?.duration) || 60;
            
            console.log(`⏭️ [KTV] Completing segment ${currentIdx + 1}/${totalSegs}, moving to segment ${nextIdx + 1} (${nextDuration} min)`);
            const isSameRoom = String(currentSeg?.roomId) === String(nextSeg?.roomId);
            
            manualSegmentOverrideRef.current = true; // Ngăn auto-calc ghi đè
            setActiveSegmentIndex(nextIdx);
            setTimeRemaining(nextDuration * 60);
            
            if (isSameRoom) {
               // Cùng phòng -> Tiếp tục chạy, giữ nguyên trạng thái IN_PROGRESS
               console.log(`🚪 [KTV] Cùng phòng ${currentSeg?.roomId}. Tự động nhảy timer...`);
            } else {
               // Khác phòng -> Cần nghỉ giải lao -> PREPARING
               console.log(`🚪 [KTV] Khác phòng (${currentSeg?.roomId} -> ${nextSeg?.roomId}). Chờ KTV bấm bắt đầu...`);
               setIsLoading(true);
               await fetch('/api/ktv/booking', {
                   method: 'PATCH',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ 
                       bookingId: booking.id, 
                       status: 'PREPARING',
                       techCode: user.id 
                   })
               });
               setIsTimerRunning(false);
               setIsLoading(false);
            }
            return;
        }

        // 🏁 Chặng cuối → COMPLETED toàn bộ
        setIsLoading(true);
        const response = await fetch('/api/ktv/booking', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                bookingId: booking.id, 
                status: 'COMPLETED',
                techCode: user.id 
            })
        });
        const res = await response.json();
        if (res.success) {
            setIsTimerRunning(false);
            setScreen('REVIEW');
        } else {
            console.error('❌ [KTV Logic] Finish error:', res.error);
            alert('Lỗi cập nhật trạng thái: ' + (res.error || 'Unknown error'));
        }
        setIsLoading(false);
    };

    // Keep ref up-to-date so timer callback always calls latest version
    handleFinishTimerRef.current = handleFinishTimer;

    const handleSubmitReview = async (customerProfile: any) => {
        if (!booking || !user?.id) return;
        
        setIsLoading(true);
        try {
            const personality = customerProfile.personality || [];
            if (personality.length > 0) {
                const noteContent = `[Đánh giá KTV: ${personality.join(', ')}]`;
                
                // Gửi ghi chú đánh giá về quầy
                await fetch('/api/ktv/booking', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        bookingId: booking.id, 
                        status: 'CLEANING', // Đồng bộ nhóm: Bắt đầu dọn phòng
                        notes: noteContent,
                        action: 'APPEND_NOTES',
                        techCode: user.id
                    })
                });
            }
            
            setHasSubmittedReview(true);
            setScreen('HANDOVER');
        } catch (err) {
            console.error('❌ [KTV Logic] Error submitting review:', err);
            setScreen('HANDOVER');
        } finally {
            setIsLoading(false);
        }
    };


    const handleFinishHandover = async () => {
        if (!booking || !user?.id) return;
        setIsLoading(true);
        try {
            // 🔥 TÍNH TIỀN TUA CHÍNH XÁC: Theo thời gian admin gán trong segments
            // Hỗ trợ multi-item: 1 KTV + 2 DV → assignedItemIds = ["id1", "id2"]
            const itemIds: string[] = booking.assignedItemIds?.length > 0
                ? booking.assignedItemIds
                : (booking.assignedItemId ? [booking.assignedItemId] : []);
            
            const assignedItems = itemIds.length > 0
                ? booking.BookingItems?.filter((i: any) => itemIds.includes(i.id)) || []
                : [booking.BookingItems?.[0]].filter(Boolean);
            
            // Tổng tất cả segment duration của KTV này across all assigned items
            let totalMins = 0;
            for (const item of assignedItems) {
                if (item?.segments) {
                    try {
                        const segs = typeof item.segments === 'string' 
                            ? JSON.parse(item.segments) 
                            : (item.segments || []);
                        const mySegs = segs.filter((seg: any) => 
                            seg.ktvId && seg.ktvId.toLowerCase().includes(user.id.toLowerCase())
                        );
                        if (mySegs.length > 0) {
                            totalMins += mySegs.reduce((sum: number, seg: any) => sum + (Number(seg.duration) || 0), 0);
                        } else {
                            totalMins += item.duration || 60;
                        }
                    } catch { totalMins += item.duration || 60; }
                } else {
                    totalMins += item?.duration || 60;
                }
            }
            if (totalMins === 0) totalMins = 60; // fallback
            console.log("💰 [Commission] Items:", itemIds.length, "Total Duration:", totalMins);

            // 1. Giải phóng KTV khỏi TurnQueue
            const response = await fetch('/api/ktv/booking', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    bookingId: booking.id, 
                    status: 'DONE', // Đồng bộ nhóm: Đã dọn xong hoàn toàn
                    action: 'RELEASE_KTV',
                    techCode: user.id 
                })
            });
            const res = await response.json();
            
            if (!res.success) {
                console.error('Lỗi khi giải phóng KTV:', res.error);
            }

            const milestones = settings.ktv_commission_milestones || {
                '1': 2000, '30': 50000, '45': 75000, '60': 100000, '70': 117000, 
                '90': 150000, '120': 200000, '180': 300000, '300': 500000
            };
            
            let calculatedCommission = 0;
            const minsStr = String(totalMins);

            if (milestones[minsStr]) {
                calculatedCommission = Number(milestones[minsStr]);
            } else {
                const rate = Number(settings.ktv_commission_per_60min || 100000);
                const rawCommission = (totalMins / 60) * rate;
                calculatedCommission = Math.round(rawCommission / 1000) * 1000;
            }
            
            setCommission(calculatedCommission);

            // KHÔNG xoá booking ở đây để Reward còn lấy được rating/points
            setPrepChecklist(prev => prev.map(() => false));
            setCleanChecklist(prev => prev.map(() => false));
            setIsPrepping(false);
            setPrepTimeRemaining(0);
            
            // Luôn chuyển sang REWARD để KTV thấy thành quả công việc
            setScreen('REWARD');
        } catch (err) {
            console.error('Error in finish handover:', err);
            setScreen('REWARD');
        } finally {
            setIsLoading(false);
        }
    };

    const handleInteraction = async (type: 'WATER' | 'SUPPORT' | 'EMERGENCY' | 'BUY_MORE' | 'EARLY_EXIT') => {
        if (!booking) return;
        setIsLoading(true);
        try {
            const response = await fetch('/api/ktv/interaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: booking.id, type, techCode: user?.id })
            });
            const res = await response.json();
            if (res.success) {
                console.log(`Sent interaction: ${type}`);
            } else {
                alert('Lỗi gửi yêu cầu');
            }
        } catch (err) {
            console.error('Error sending interaction:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEarlyExit = async () => {
        if (!booking || !user?.id) return;
        if (!confirm('Thông báo cho quầy khách muốn kết thúc sớm?')) return;
        
        // 🚀 THAY ĐỔI: Không tự ý PATCH status
        // Thay vào đó gửi Interaction 'EARLY_EXIT' để Lễ tân xử lý
        // Khi lễ tân xử lý xong (Hoàn tất trên Dispatch Board), Realtime sẽ tự đưa KTV qua trang REVIEW/REWARD
        await handleInteraction('EARLY_EXIT');
        alert('Đã gửi yêu cầu về sớm. Hãy đợi Lễ tân xác nhận để hoàn tất đơn hàng.');
    };

    const goToDashboard = () => {
        if (booking?.id) {
            lastAcknowledgedIdRef.current = booking.id;
        }
        setHasSubmittedReview(false);
        setBooking(null);
        setScreen('DASHBOARD');
    };

    return {
        user,
        screen,
        booking,
        isLoading,
        checklist,
        toggleChecklist,
        isChecklistComplete,
        handleConfirmSetup,
        timeRemaining,
        isTimerRunning,
        prepTimeRemaining,
        isPrepping,
        handleStartTimer,
        handleFinishTimer,
        handleSubmitReview,
        handoverChecklist,
        toggleHandoverChecklist,
        checkAllChecklist,
        checkAllHandoverChecklist,
        isHandoverComplete,
        handleFinishHandover,
        commission,
        bonusMessage,
        setBonusMessage,
        goToDashboard,
        showProcedure,
        setShowProcedure,
        handleInteraction,
        handleEarlyExit,
        canStart,
        allowedStartTime,
        activeSegmentIndex,
        // Room procedures & issue reporting
        prepProcedure,
        cleanProcedure,
        showRoomIssueModal,
        setShowRoomIssueModal,
        handleReportRoomIssue,
        settings
    };
}
