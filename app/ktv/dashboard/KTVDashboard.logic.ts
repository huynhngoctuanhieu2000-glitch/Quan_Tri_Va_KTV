import { useState, useEffect, useCallback, useRef } from 'react';
// Đã chuyển sang dùng REST API /api/ktv/... thay vì server actions trực tiếp
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export type ScreenState = 'DASHBOARD' | 'TIMER' | 'REVIEW' | 'REWARD' | 'HANDOVER';

export function useKTVDashboard() {
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
                const audio = new Audio('/sounds/ktv-notification.wav');
                audio.play().catch(err => console.error("🔇 [KTV] Audio play failed:", err));
            } catch (e) {
                console.error("🔇 [KTV] Audio creation failed:", e);
            }
        }
        prevBookingIdRef.current = booking?.id || null;
    }, [booking, isLoading]);

    // ✨ Bonus Points logic consolidated into fetchBooking for reliability

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
                const response = await fetch(`/api/ktv/booking?techCode=${user.id}`);
                const res = await response.json();
                
                if (res.success && res.data) {
                    // IGNORE if this is the booking we just finished and acknowledged
                    if (res.data.id === lastAcknowledgedIdRef.current) {
                        setBooking(null);
                        return;
                    }

                    // Update state ONLY if data actually changed to avoid timer reset & sound spam
                    setBooking((prev: any) => {
                        // ✨ CHECK FOR NEW EXCELLENT RATING (>= 4 stars)
                        const newRating = res.data.rating;
                        const oldRating = prev?.rating;
                        if (newRating >= 4 && (!oldRating || oldRating < 4)) {
                            console.log("💎 [KTV] Excellent rating detected inside sync:", newRating);
                            setBonusMessage(`Bạn nhận được 25đ đánh giá xuất sắc từ đơn hàng #${res.data.billCode}`);
                            try {
                                // 🔊 Audio Fix: Use existing ktv-notification.wav instead of missing win-sound.wav
                                const winAudio = new Audio('/sounds/ktv-notification.wav');
                                winAudio.volume = 0.5;
                                winAudio.play().catch(e => console.warn("🔊 [KTV] Bonus sound play failed:", e));
                            } catch(e) {
                                console.error("🔊 [KTV] Audio creation error:", e);
                            }
                            setTimeout(() => setBonusMessage(null), 15000);
                        }

                        const isNew = !prev || prev.id !== res.data.id;
                        const isStatusChanged = prev?.status !== res.data.status;
                        
                        // Always update if we have new items content (names, durations, focus)
                        // but only trigger screen jumps or timer resets if significantly different
                        if (isNew || isStatusChanged || JSON.stringify(prev?.BookingItems) !== JSON.stringify(res.data.BookingItems)) {
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
                            } else if (res.data.status === 'COMPLETED' && (currentScreen === 'DASHBOARD' || currentScreen === 'TIMER') && !hasSubmittedReview) {
                                // Status COMPLETED means "Checking items & Feedback" for customer
                                // KTV moves to Review/Handover
                                setScreen('REVIEW');
                                setIsTimerRunning(false);
                            } else if (res.data.status === 'DONE' && (currentScreen === 'TIMER' || currentScreen === 'DASHBOARD')) {
                                // If status is DONE but we are still in TIMER/DASHBOARD, 
                                // it means customer finished before KTV ended timer. Move to REVIEW.
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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Bookings' }, (payload: any) => {
                console.log("🔄 [KTV] Realtime signal received:", payload.eventType);
                fetchBooking();
            })
            .subscribe();

        // Polling fallback (every 20 seconds) for high reliability
        const intervalId = setInterval(fetchBooking, 20000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(intervalId);
        };
    }, [user?.id, isTimerRunning]); // Added isTimerRunning to dependencies to ensure timer updates correctly on status change

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
        if (!booking) return;
        setIsLoading(true);
        const response = await fetch('/api/ktv/booking', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: booking.id, status: 'IN_PROGRESS' })
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
        if (!booking) return;
        setIsLoading(true);
        const response = await fetch('/api/ktv/booking', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: booking.id, status: 'COMPLETED' })
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

    const handleSubmitReview = (customerProfile: any) => {
        setHasSubmittedReview(true);
        setScreen('HANDOVER');
    };


    const handleFinishHandover = async () => {
        if (!booking) return;
        setIsLoading(true);
        try {
            // Sau khi dọn dẹp xong, KTV gửi lệnh DONE để kết thúc đơn hàng hoàn toàn
            const response = await fetch('/api/ktv/booking', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: booking.id, status: 'DONE' })
            });
            const res = await response.json();
            
            if (!res.success) {
                console.error('Lỗi khi cập nhật trạng thái dọn dẹp xong:', res.error);
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

    const handleInteraction = async (type: 'WATER' | 'SUPPORT' | 'EMERGENCY' | 'BUY_MORE') => {
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
        if (!booking) return;
        if (!confirm('Xác nhận khách muốn kết thúc dịch vụ sớm?')) return;
        
        setIsLoading(true);
        const response = await fetch('/api/ktv/booking', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: booking.id, status: 'COMPLETED', action: 'EARLY_EXIT' })
        });
        const res = await response.json();
        if (res.success) {
            setIsTimerRunning(false);
            setScreen('REVIEW');
        } else {
            alert('Lỗi khi chốt đơn sớm');
        }
        setIsLoading(false);
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
