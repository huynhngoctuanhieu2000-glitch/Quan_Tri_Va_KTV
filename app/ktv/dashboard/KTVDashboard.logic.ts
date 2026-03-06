import { useState, useEffect, useCallback } from 'react';
import { getPendingBooking, updateBookingStatus } from './actions';
import { useAuth } from '@/lib/auth-context';

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

    // Poll for new booking if IDLE
    useEffect(() => {
        let intervalId: NodeJS.Timeout;

        const fetchBooking = async () => {
            if (booking || !user?.id) {
                setIsLoading(false);
                return;
            }
            try {
                const res = await getPendingBooking(user.id);
                if (res.success && res.data) {
                    setBooking(res.data);
                    // Determine initial screen based on booking status
                    if (res.data.status === 'IN_PROGRESS') {
                        setScreen('TIMER');
                        setIsTimerRunning(true);
                    }
                    
                    // Set time remaining based on the first service item or default 60
                    const firstItem = res.data.BookingItems?.[0];
                    const duration = firstItem?.duration || 60;
                    setTimeRemaining(duration * 60);
                }
            } catch (err) {
                console.error('Error polling booking:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchBooking();
        intervalId = setInterval(fetchBooking, 10000); // Check every 10 seconds

        return () => clearInterval(intervalId);
    }, [booking]);

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
