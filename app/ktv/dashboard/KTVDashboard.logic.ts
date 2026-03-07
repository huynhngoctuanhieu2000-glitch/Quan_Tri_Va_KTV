import { useState, useEffect, useCallback, useRef } from 'react';
import { getPendingBooking, updateBookingStatus } from './actions';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export type ScreenState = 'DASHBOARD' | 'TIMER' | 'REVIEW' | 'REWARD' | 'HANDOVER';

export function useKTVDashboard() {
    const { user } = useAuth();
    const [screen, setScreen] = useState<ScreenState>('DASHBOARD');
    const [booking, setBooking] = useState<any>(null);
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
        ac: false,
        fan: false
    });

    const isChecklistComplete = Object.values(checklist).every(Boolean);
    const isHandoverComplete = Object.values(handoverChecklist).every(Boolean);

    const [timeRemaining, setTimeRemaining] = useState(90 * 60); // Mock 90 min
    const [isTimerRunning, setIsTimerRunning] = useState(false);

    const prevBookingIdRef = useRef<string | null>(null);
    const isFirstLoadRef = useRef<boolean>(true);

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
            const audio = new Audio('/sounds/ktv-notification.wav');
            audio.play().catch(err => console.error("🔇 [KTV] Audio play failed:", err));
        }
        prevBookingIdRef.current = booking?.id || null;
    }, [booking, isLoading]);

    // 📡 Realtime & Polling Fetch
    useEffect(() => {
        if (!user?.id) return;

        const fetchBooking = async () => {
            try {
                const res = await getPendingBooking(user.id);
                if (res.success && res.data) {
                    // Update state ONLY if data actually changed to avoid timer reset & sound spam
                    setBooking((prev: any) => {
                        const isNew = !prev || prev.id !== res.data.id;
                        const isStatusChanged = prev?.status !== res.data.status;
                        
                        if (isNew || isStatusChanged) {
                            // Update timer only if it's a new booking or not already running
                            if (isNew || (res.data.status === 'IN_PROGRESS' && !isTimerRunning)) {
                                if (res.data.status === 'IN_PROGRESS') {
                                    setScreen('TIMER');
                                    setIsTimerRunning(true);
                                }
                                const firstItem = res.data.BookingItems?.[0];
                                const duration = firstItem?.duration || 60;
                                setTimeRemaining(duration * 60);
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
    }, [user?.id]); // Only depend on user.id to keep subscription stable

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isTimerRunning && timeRemaining > 0) {
            timer = setInterval(() => {
                setTimeRemaining(prev => prev - 1);
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isTimerRunning, timeRemaining]);

    const toggleChecklist = (key: keyof typeof checklist) => {
        setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleHandoverChecklist = (key: keyof typeof handoverChecklist) => {
        setHandoverChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleConfirmSetup = () => {
        setScreen('TIMER');
    };

    const handleStartTimer = async () => {
        if (!booking) return;
        setIsLoading(true);
        const res = await updateBookingStatus(booking.id, 'IN_PROGRESS');
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
        const res = await updateBookingStatus(booking.id, 'COMPLETED');
        if (res.success) {
            setIsTimerRunning(false);
            setScreen('REVIEW');
        } else {
            alert('Lỗi cập nhật trạng thái');
        }
        setIsLoading(false);
    };

    const handleSubmitReview = (customerProfile: any) => {
        // Optionally update booking with customer profile tags here
        setScreen('HANDOVER');
    };

    const handleFinishHandover = () => {
        // Reset state for next customer
        setBooking(null);
        setChecklist({ ac: false, towel: false, oil: false, bed: false, toilet: false });
        setHandoverChecklist({ towel: false, bed: false, trash: false, light: false, ac: false, fan: false });
        setScreen('REWARD'); // Or strictly back to DASHBOARD depending on flow
    };

    const goToDashboard = () => setScreen('DASHBOARD');

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
        handleStartTimer,
        handleFinishTimer,
        handleSubmitReview,
        handoverChecklist,
        toggleHandoverChecklist,
        isHandoverComplete,
        handleFinishHandover,
        goToDashboard
    };
}
