import { useState, useEffect, useCallback, useRef } from 'react';
// Đã chuyển sang dùng REST API /api/ktv/... thay vì server actions trực tiếp
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export type ScreenState = 'DASHBOARD' | 'TIMER' | 'REVIEW' | 'REWARD' | 'HANDOVER';

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
    const [checklist, setChecklist] = useState({
        ac: false,
        towel: false,
        oil: false,
        bed: false,
        toilet: false
    });

    const [handoverChecklist, setHandoverChecklist] = useState({
        towel: false,
        bed: false,
        trash: false,
        light: false,
        ac: false
    });

    const isChecklistComplete = Object.values(checklist).every(Boolean);
    const isHandoverComplete = 
        handoverChecklist.towel && 
        handoverChecklist.bed && 
        handoverChecklist.trash && 
        handoverChecklist.light && 
        handoverChecklist.ac;

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
    useEffect(() => { screenRef.current = screen; }, [screen]);

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
            setActiveSegmentIndex(0);
            return;
        }

        const updateActiveSegment = () => {
            // 1. Tìm dịch vụ được gán cho KTV này
            const assignedItem = booking.assignedItemId 
                ? booking.BookingItems?.find((i: any) => i.id === booking.assignedItemId)
                : booking.BookingItems?.[0];

            if (!assignedItem || !assignedItem.segments || assignedItem.segments.length === 0) return;

            // 2. Tính toán lộ trình thực tế (Shifted Segments)
            let tStart = assignedItem.timeStart || booking.timeStart;
            if (!tStart) return;

            if (typeof tStart === 'string' && !tStart.includes('Z') && !tStart.includes('+')) {
                tStart = tStart.replace(' ', 'T') + 'Z';
            }
            const actualStartMs = new Date(tStart).getTime();
            const nowMs = new Date().getTime();

            let currentOffsetMs = 0;
            let foundIdx = 0;

            assignedItem.segments.forEach((seg: any, idx: number) => {
                const segStartMs = actualStartMs + currentOffsetMs;
                const segEndMs = segStartMs + (seg.duration * 60 * 1000);
                
                // Nếu thời gian hiện tại đã vượt qua điểm bắt đầu chặng này
                if (nowMs >= segStartMs) {
                    foundIdx = idx;
                }
                
                currentOffsetMs += (seg.duration * 60 * 1000);
            });

            setActiveSegmentIndex(foundIdx);
        };

        updateActiveSegment();
        const interval = setInterval(updateActiveSegment, 10000); // Check mỗi 10s
        return () => clearInterval(interval);
    }, [booking]);

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
                        
                        if (newRating >= 4 && oldRating < 4) {
                            console.log("💎 [KTV] High rating detected in direct fetch:", newRating);
                        }

                        const isNew = !prev || prev.id !== res.data.id;
                        
                        // Tìm dịch vụ được gán cho KTV này
                        const assignedItem = res.data.assignedItemId 
                            ? res.data.BookingItems?.find((i: any) => i.id === res.data.assignedItemId)
                            : res.data.BookingItems?.[0];

                        // Ưu tiên trạng thái của Item để đồng bộ nhóm KTV làm chung 1 dịch vụ
                        const currentStatus = assignedItem?.status || res.data.status;
                        const prevStatus = prev?.assignedItemId 
                            ? prev.BookingItems?.find((i: any) => i.id === prev.assignedItemId)?.status || prev.status
                            : prev?.status;

                        const isStatusChanged = prevStatus !== currentStatus;
                        const isRatingChanged = oldRating !== newRating;
                        
                        if (isNew || isStatusChanged || isRatingChanged || JSON.stringify(prev?.BookingItems) !== JSON.stringify(res.data.BookingItems)) {
                            // Tính thời gian cho item được gán
                            const duration = assignedItem?.duration || 60;

                            // Luôn cập nhật thời gian nếu đơn mới hoặc đang chạy để đồng bộ với Database
                            if (isNew || (currentStatus === 'IN_PROGRESS' && (assignedItem?.timeStart || res.data.timeStart))) {
                                const totalSecs = duration * 60;
                                let tStart = assignedItem?.timeStart || res.data.timeStart;
                                
                                if (currentStatus === 'IN_PROGRESS' && tStart) {
                                    if (typeof tStart === 'string' && !tStart.includes('Z') && !tStart.includes('+')) {
                                        tStart = tStart.replace(' ', 'T') + 'Z';
                                    }
                                    const start = new Date(tStart).getTime();
                                    const now = new Date().getTime();
                                    const elapsed = Math.floor((now - start) / 1000);
                                    setTimeRemaining(Math.max(0, totalSecs - elapsed));
                                } else {
                                    setTimeRemaining(totalSecs);
                                }
                            }

                            // Update screen based on status
                            const currentScreen = screenRef.current;

                            if (currentStatus === 'IN_PROGRESS' && currentScreen !== 'TIMER') {
                                setScreen('TIMER');
                                setIsTimerRunning(true);
                            } else if ((currentStatus === 'COMPLETED' || currentStatus === 'FEEDBACK' || res.data.status === 'COMPLETED') && (currentScreen === 'DASHBOARD' || currentScreen === 'TIMER') && !hasSubmittedReview) {
                                setScreen('REVIEW');
                                setIsTimerRunning(false);
                            } else if ((currentStatus === 'DONE' || res.data.status === 'DONE') && (currentScreen === 'TIMER' || currentScreen === 'DASHBOARD')) {
                                setScreen('REVIEW');
                                setIsTimerRunning(false);
                            }

                            if (config?.initialAction === 'rate' && config?.targetBookingId === res.data.id && screenRef.current === 'DASHBOARD') {
                                setScreen('REVIEW');
                                setIsTimerRunning(false);
                            }
                            return res.data;
                        }
                        return prev;
                    });
                } else if (res.success && !res.data) {
                    // Chỉ xóa booking nếu không phải màn hình hậu kỳ
                    const isPostService = ['REVIEW', 'HANDOVER', 'REWARD'].includes(screenRef.current);
                    if (!isPostService) {
                        setBooking(null);
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
                
                // 🚀 STATE PATCHING: Update status locally immediately
                setBooking((prev: any) => {
                    if (!prev || prev.id !== payload.new.id) return prev;
                    return { ...prev, ...payload.new };
                });

                // Background sync
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

        // Polling fallback (every 20 seconds) for high reliability
        const intervalId = setInterval(fetchBooking, 20000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(intervalId);
        };
    }, [user?.id, booking?.id, isTimerRunning]); // Added booking?.id to deps to re-bind filter

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
                setTimeRemaining(prev => {
                    if (prev <= 1 && settings.auto_finish_on_timer_end) {
                        // Tự động kết thúc nếu hết giờ
                        handleFinishTimer();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isPrepping, prepTimeRemaining, isTimerRunning, timeRemaining, settings.auto_finish_on_timer_end]);

    const toggleChecklist = (key: keyof typeof checklist) => {
        setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleHandoverChecklist = (key: keyof typeof handoverChecklist) => {
        setHandoverChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleConfirmSetup = () => {
        const assignedItem = booking?.assignedItemId 
            ? booking.BookingItems?.find((i: any) => i.id === booking.assignedItemId)
            : booking?.BookingItems?.[0];
            
        const duration = assignedItem?.duration || 60;
        setTimeRemaining(duration * 60);
        setPrepTimeRemaining(settings.ktv_setup_duration_minutes * 60);
        setIsPrepping(true);
        setScreen('TIMER');
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
                techCode: user.id 
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
                        status: booking.status,
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
            // Sau khi dọn dẹp xong, KTV gửi lệnh RELEASE_KTV để giải phóng lượt làm của mình
            // Quan trọng: Lệnh này không được đóng đơn hàng (DONE) để khách có thể gửi Feedback độc lập
            const response = await fetch('/api/ktv/booking', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    bookingId: booking.id, 
                    status: booking.status, // Giữ nguyên status hiện tại
                    action: 'RELEASE_KTV',
                    techCode: user.id // QUAN TRỌNG: Chỉ giải phóng KTV này
                })
            });
            const res = await response.json();
            
            if (!res.success) {
                console.error('Lỗi khi giải phóng KTV:', res.error);
            }

            // Tính tiền tua (Ưu tiên bảng mốc, sau đó mới tính theo công thức và làm tròn)
            const durationArr = booking.BookingItems?.map((i: any) => i.duration || 60) || [60];
            const totalMins = durationArr.reduce((a: number, b: number) => a + b, 0);
            
            const milestones = settings.ktv_commission_milestones || {
                '1': 2000, '30': 50000, '45': 75000, '60': 100000, '70': 117000, 
                '90': 150000, '120': 200000, '180': 300000, '300': 500000
            };
            
            let calculatedCommission = 0;
            const minsStr = String(totalMins);

            if (milestones[minsStr]) {
                // Nếu quy trình có mốc khớp hoàn toàn (ví dụ 70p)
                calculatedCommission = Number(milestones[minsStr]);
            } else {
                // Tính theo công thức mặc định và làm tròn đến hàng nghìn
                const rate = Number(settings.ktv_commission_per_60min || 100000);
                const rawCommission = (totalMins / 60) * rate;
                calculatedCommission = Math.round(rawCommission / 1000) * 1000;
            }
            
            setCommission(calculatedCommission);

            // KHÔNG xoá booking ở đây để Reward còn lấy được rating/points
            setChecklist({ ac: false, towel: false, oil: false, bed: false, toilet: false });
            setHandoverChecklist({ towel: false, bed: false, trash: false, light: false, ac: false });
            setIsPrepping(false);
            setPrepTimeRemaining(0);
            
            // Luôn chuyển sang REWARD để KTV thấy thành quả công việc
            setScreen('REWARD');
        } catch (err) {
            console.error('Error in finish handover:', err);
            // Fallback: Vẫn cho qua trang REWARD
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
                body: JSON.stringify({ bookingId: booking.id, type })
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
        activeSegmentIndex
    };
}
