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

    const lastAcknowledgedIdRef = useRef<string | null>(null);
    const prevBookingIdRef = useRef<string | null>(null);
    const isFirstLoadRef = useRef<boolean>(true);
    const screenRef = useRef<ScreenState>(screen);
    useEffect(() => { screenRef.current = screen; }, [screen]);

    // 🔊 Audio Notification Logic
    useEffect(() => {
        // Skip sound on initial page load
        if (!isLoading && isFirstLoadRef.current) {
            prevBookingIdRef.current = booking?.id || null;
            isFirstLoadRef.current = false;
            console.log("ℹ️ [KTV] First load synced, skipping potential sound.");
            return;
        }

        if (booking?.id && booking.id !== prevBookingIdRef.current) {
            console.log("🔔 [KTV] New booking assigned! Playing sound...");
            try {
                const soundPath = '/sounds/ktv-don-hang-moi.wav';
                console.log("🔔 [KTV Logic] New booking audio attempt:", soundPath);
                const audio = new Audio(soundPath);
                audio.play().catch(err => console.error("🔇 [KTV Logic] Audio play failed (Check interaction):", err));
            } catch (e) {
                console.error("🔇 [KTV Logic] Audio creation failed:", e);
            }
        }
        prevBookingIdRef.current = booking?.id || null;
    }, [booking, isLoading]);

    // ✨ Bonus Points logic consolidated into fetchBooking for reliability
    useEffect(() => {
        if (!user?.id) return;

        const checkRewards = async () => {
            // Không gửi thông báo khi đang trong quy trình làm dịch vụ (TIMER)
            if (screenRef.current === 'TIMER') return;

            try {
                const response = await fetch(`/api/ktv/notifications?techCode=${user.id}`);
                const res = await response.json();
                
                if (res.success && res.data && res.data.length > 0) {
                    const notify = res.data[0]; // Lấy cái mới nhất
                    setBonusMessage(notify.message);
                    
                    try {
                        const winAudio = new Audio('/sounds/ktv-nhan-thuong.wav');
                        winAudio.volume = 0.5;
                        winAudio.play().catch(e => console.warn("🔊 [KTV] Bonus sound failed:", e));
                    } catch(e) {}

                    // Đánh dấu đã đọc
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
                
                // Nâng cao: Ưu tiên targetBookingId từ URL (nếu có)
                if (config?.targetBookingId) {
                    url = `/api/ktv/booking?bookingId=${config.targetBookingId}`;
                } 
                // Nếu đã giải phóng KTV nhưng đang ở màn checkout (REVIEW/HANDOVER/REWARD), track đơn cũ
                else if (['REVIEW', 'HANDOVER', 'REWARD'].includes(screenRef.current) && !booking && prevBookingIdRef.current) {
                    // Nếu đã xác nhận xong (lastAcknowledgedIdRef), không track nữa
                    if (lastAcknowledgedIdRef.current === prevBookingIdRef.current) {
                        setBooking(null);
                        return;
                    }
                    url = `/api/ktv/booking?bookingId=${prevBookingIdRef.current}`;
                    console.log("🔍 [KTV] Tracking released booking for rating:", prevBookingIdRef.current);
                }

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
                        // ✨ CHECK FOR NEW EXCELLENT RATING (>= 4 stars)
                        const newRating = Number(res.data.rating || 0);
                        const oldRating = Number(prev?.rating || 0);
                        
                        // ✨ Đã chuyển sang dùng StaffNotifications Trigger để thông báo bền vững hơn
                        // Ở đây chỉ log để debug nếu cần
                        if (newRating >= 4 && oldRating < 4) {
                            console.log("💎 [KTV] High rating detected in direct fetch:", newRating);
                        }

                        const isNew = !prev || prev.id !== res.data.id;
                        const isStatusChanged = prev?.status !== res.data.status;
                        const isRatingChanged = oldRating !== newRating;
                        
                        if (isNew || isStatusChanged || isRatingChanged || JSON.stringify(prev?.BookingItems) !== JSON.stringify(res.data.BookingItems)) {
                            // Tính tổng thời gian của tất cả dịch vụ trong đơn
                            const durationArr = res.data.BookingItems?.map((i: any) => i.duration || 60) || [60];
                            const totalDuration = durationArr.reduce((a: number, b: number) => a + b, 0);
                            const duration = totalDuration;

                            // Luôn cập nhật thời gian nếu đơn mới hoặc đang chạy để đồng bộ với Database
                            if (isNew || (res.data.status === 'IN_PROGRESS' && res.data.timeStart)) {
                                const totalSecs = duration * 60;
                                if (res.data.status === 'IN_PROGRESS' && res.data.timeStart) {
                                    // Tính toán thời gian còn lại dựa trên Server Time (timeStart)
                                    // Bổ sung 'Z' để đảm bảo tính toán UTC đồng nhất
                                    let tStart = res.data.timeStart;
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

                            if (res.data.status === 'IN_PROGRESS' && currentScreen !== 'TIMER') {
                                setScreen('TIMER');
                                setIsTimerRunning(true);
                            } else if ((res.data.status === 'COMPLETED' || res.data.status === 'FEEDBACK') && (currentScreen === 'DASHBOARD' || currentScreen === 'TIMER') && !hasSubmittedReview) {
                                // Status COMPLETED or FEEDBACK means customer is checking items & Feedback
                                // KTV moves to Review/Handover
                                setScreen('REVIEW');
                                setIsTimerRunning(false);
                            } else if (res.data.status === 'DONE' && (currentScreen === 'TIMER' || currentScreen === 'DASHBOARD')) {
                                // If status is DONE but we are still in TIMER/DASHBOARD, 
                                // it means customer finished before KTV ended timer. Move to REVIEW.
                                setScreen('REVIEW');
                                setIsTimerRunning(false);
                            }

                            // ✨ HACK: Nếu bấm "Đánh giá" từ trang Lịch sử
                            if (config?.initialAction === 'rate' && config?.targetBookingId === res.data.id && screenRef.current === 'DASHBOARD') {
                                setScreen('REVIEW');
                                setIsTimerRunning(false);
                            }
                            return res.data;
                        }
                        return prev;
                    });
                } else if (res.success && !res.data) {
                    setBooking(null);
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
        const durationArr = booking?.BookingItems?.map((i: any) => i.duration || 60) || [60];
        const duration = durationArr.reduce((a: number, b: number) => a + b, 0);
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
            alert('Lỗi cập nhật trạng thái');
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
            alert('Lỗi cập nhật trạng thái');
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
        handleEarlyExit
    };
}
