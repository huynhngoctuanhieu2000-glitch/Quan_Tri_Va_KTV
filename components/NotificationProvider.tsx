'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, ShieldAlert, X, CheckCircle, Info, AlertTriangle, Check, Star, ArrowRight, MapPin, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

// --- TYPES ---
interface Notification {
    id: string;
    type: string;
    message: string;
    createdAt: string;
    isRead: boolean;
    employeeId?: string;
    bookingId?: string;
}

interface NotificationContextType {
    notifications: Notification[];
    markAsRead: (id: string) => void;
    soundEnabled: boolean;
    setSoundEnabled: (enabled: boolean) => void;
    unlockAudio: () => void;
    playSound: (type: string) => void;
    setKtvScreen: (screen: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// --- CONFIG ---
const SOUND_MAP: Record<string, string> = {
    'EMERGENCY': '/sounds/quay-bao-khan-cap.wav',
    'SOS': '/sounds/quay-bao-khan-cap.wav',           // Alias của EMERGENCY
    'ADD_SERVICE': '/sounds/reception-notification.wav', // Alias của BUY_MORE
    'COMPLAINT': '/sounds/quay-danh-gia-te.wav',
    'EARLY_EXIT': '/sounds/quay-khach-ve-som.wav',
    'WATER': '/sounds/reception-notification.wav',
    'BUY_MORE': '/sounds/reception-notification.wav',
    'SUPPORT': '/sounds/reception-notification.wav',
    'NEW_ORDER': '/sounds/quay-don-hang-moi.wav', // Mặc định cho quầy
    'KTV_NEW_ORDER': '/sounds/ktv-don-hang-moi.wav',
    'REWARD': '/sounds/ktv-nhan-thuong.wav',
    'CHECK_IN': '/sounds/reception-notification.wav', // KTV điểm danh
    'default': '/sounds/reception-notification.wav'
};

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, role } = useAuth();
    const [toastQueue, setToastQueue] = useState<Notification[]>([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [ktvScreen, setKtvScreen] = useState<string>('DASHBOARD');
    const audioUnlockedRef = useRef<boolean>(false);
    const audioInstanceRef = useRef<HTMLAudioElement | null>(null);
    const lastSoundTimeRef = useRef<number>(0);
    const router = useRouter();

    // Prime the audio instance on first load
    useEffect(() => {
        if (typeof window !== 'undefined' && !audioInstanceRef.current) {
            audioInstanceRef.current = new Audio();
            audioInstanceRef.current.volume = 0.5;
        }
    }, []);

    const unlockAudio = () => {
        if (audioUnlockedRef.current || !audioInstanceRef.current) return;
        
        const audio = audioInstanceRef.current;
        // iOS needs a real play() on a real file during a user gesture
        audio.src = '/sounds/quay-don-hang-moi.wav';
        audio.volume = 0.01;
        
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                audioUnlockedRef.current = true;
                console.log('✅ [NotificationProvider] Audio context primed.');
                audio.pause();
                audio.currentTime = 0;
                audio.volume = 0.5;
            }).catch(err => {
                console.debug('⏳ [NotificationProvider] Priming failed (interaction needed):', err);
            });
        }
    };

    const playSound = (type: string) => {
        if (!soundEnabled || !audioInstanceRef.current) return;
        const normalizedType = (type || 'default').toUpperCase().trim();
        const now = Date.now();
        
        // Giới hạn tần suất phát (tránh bị rè hoặc chồng chéo quá nhanh), trừ khẩn cấp
        if (normalizedType !== 'EMERGENCY' && normalizedType !== 'COMPLAINT' && now - lastSoundTimeRef.current < 2000) {
            console.log('🔇 [NotificationProvider] Sound throttled:', normalizedType);
            return;
        }

        let soundKey = normalizedType;
        
        // Xử lý riêng biệt cho KTV để có âm thanh đặc thù
        if (role?.id === 'ktv') {
            if (normalizedType === 'NEW_ORDER') {
                soundKey = 'KTV_NEW_ORDER';
            } else if (normalizedType === 'REWARD') {
                soundKey = 'REWARD';
            }
        }

        const soundPath = SOUND_MAP[soundKey] || SOUND_MAP[normalizedType] || SOUND_MAP['default'];
        console.log(`🔊 [NotificationProvider] Type: ${type} -> Key: ${soundKey} -> Path: ${soundPath}`);
        
        const audio = audioInstanceRef.current;
        audio.volume = (normalizedType === 'EMERGENCY' || normalizedType === 'SOS') ? 1.0 : 0.7;
        try {
            audio.pause();
            audio.src = soundPath;
            audio.load();
            
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn('🔇 [NotificationProvider] play blocked:', err);
                    audioUnlockedRef.current = false;
                });
            }
        } catch (e) {
            console.error('❌ [NotificationProvider] Error playing sound:', e);
        }
        lastSoundTimeRef.current = now;
    };

    const addToast = (notif: Notification, shouldPlaySound = true) => {
        setToastQueue(prev => {
            // Avoid duplicates
            if (prev.some(n => n.id === notif.id)) return prev;
            return [...prev, notif];
        });
        if (shouldPlaySound) playSound(notif.type);
        
        // 🔥 THAY ĐỔI: Tự động ẩn cho KTV sau 7 giây
        if (role?.id === 'ktv') {
            setTimeout(() => {
                removeToast(notif.id);
            }, 7000);
        }
    };

    const removeToast = (id: string) => {
        setToastQueue(prev => prev.filter(n => n.id !== id));
    };

    const clearAllToasts = () => {
        setToastQueue([]);
    };

    const markAsRead = async (id: string) => {
        // Update local state
        setToastQueue(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        
        // Update database if it's a UUID (StaffNotifications)
        if (id.length > 20) { 
            await supabase.from('StaffNotifications').update({ isRead: true }).eq('id', id);
        }
    };

    useEffect(() => {
        if (!user) return;

        const roleId = role?.id;
        const isReception = roleId === 'reception' || roleId === 'admin';
        const isKtv = roleId === 'ktv';

        console.log(`📡 [NotificationProvider] Listening for ${roleId}...`);

        // Handler for incoming realtime notifications
        const handleRealtimePayload = (payload: { new: unknown }) => {
            const newNotif = payload.new as Notification;
            console.log('🔔 [NotificationProvider] New notification received:', newNotif);

            if (roleId === 'admin') {
                const isGlobal = !newNotif.employeeId;
                const isComplaint = newNotif.type === 'COMPLAINT';
                if (isGlobal || isComplaint) addToast(newNotif);
            } else if (isKtv) {
                if (newNotif.employeeId === user.id) {
                    addToast(newNotif);
                }
            } else if (isReception && (!newNotif.employeeId || newNotif.employeeId === '')) {
                addToast(newNotif);
            } else {
                console.log('⏭️ [NotificationProvider] Notification ignored by filter:', {
                    roleId,
                    userId: user.id,
                    notifTech: newNotif.employeeId
                });
            }
        };

        // Create and subscribe to the Supabase Realtime channel
        const createChannel = () => {
            const ch = supabase
                .channel('global_notifications_' + Date.now()) // unique name to avoid stale channels
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'StaffNotifications'
                }, handleRealtimePayload)
                .subscribe((status) => {
                    console.log(`📡 [NotificationProvider] Channel status: ${status}`);
                });
            return ch;
        };

        let channel = createChannel();

        // 🔄 RECONNECT: Re-subscribe when tab becomes visible again (after background / OS kill)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('👁️ [NotificationProvider] Tab became visible — reconnecting Realtime...');
                // Remove old channel and create a fresh one
                supabase.removeChannel(channel);
                channel = createChannel();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 💓 HEARTBEAT: Ping Supabase every 30s to keep the connection alive
        const heartbeat = setInterval(() => {
            if (document.visibilityState === 'visible') {
                supabase.channel('heartbeat_ping').subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        supabase.removeChannel(supabase.channel('heartbeat_ping'));
                    }
                });
            }
        }, 30_000);

        // 📲 Register Periodic Sync for SW keep-alive (if supported)
        if ('serviceWorker' in navigator && 'periodicSync' in (navigator as unknown as Record<string, unknown>)) {
            navigator.serviceWorker.ready.then((sw) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (sw as any).periodicSync?.register('keep-alive', { minInterval: 60_000 }).catch(() => {
                    console.debug('[NotificationProvider] periodicSync not granted');
                });
            });
        }

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(heartbeat);
            supabase.removeChannel(channel);
        };
    }, [user, role]);

    // Sorting logic: Unread first, then read. Within each group, newest first.
    const sortedToasts = [...toastQueue].sort((a, b) => {
        if (a.isRead === b.isRead) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return a.isRead ? 1 : -1;
    });

    return (
        <NotificationContext.Provider value={{ 
            notifications: toastQueue, 
            markAsRead, 
            soundEnabled, 
            setSoundEnabled,
            unlockAudio,
            playSound,
            setKtvScreen
        }}>
            {children}
            
            {/* TOAST UI */}
            {role?.id === 'ktv' ? (
                // GIAO DIỆN TIN NHẮN CHO KTV (Trên đầu)
                <div className="fixed top-4 left-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
                    <AnimatePresence>
                        {sortedToasts.filter(n => !n.isRead).map((n) => (
                            <KtvMessageToast 
                                key={n.id} 
                                notification={n} 
                                currentScreen={ktvScreen}
                                onRedirect={() => router.push('/ktv/history')}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                // GIAO DIỆN TOAST CHO QUẦY (Dưới góc)
                <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[9999] flex flex-col gap-3 pointer-events-none">
                    {/* Nút đóng tất cả — chỉ xuất hiện khi có >= 2 thông báo */}
                    <AnimatePresence>
                        {sortedToasts.length >= 2 && (
                            <motion.div
                                key="clear-all-btn"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                className="pointer-events-auto flex justify-end"
                            >
                                <button
                                    onClick={clearAllToasts}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 backdrop-blur-sm text-white text-[11px] font-bold shadow-lg hover:bg-slate-700 active:scale-95 transition-all"
                                >
                                    <X size={12} strokeWidth={3} />
                                    Đóng tất cả ({sortedToasts.length})
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <AnimatePresence>
                        {sortedToasts.map((n) => (
                            <Toast 
                                key={n.id} 
                                notification={n} 
                                onClose={() => removeToast(n.id)} 
                                onMarkDone={() => markAsRead(n.id)}
                                onRedirect={() => {
                                    const t = (n.type || '').toUpperCase();
                                    if (t === 'CHECK_IN') {
                                        router.push('/reception/ktv-hub');
                                    } else if (t === 'REWARD') {
                                        router.push('/ktv/history');
                                    } else {
                                        router.push('/reception/dispatch');
                                    }
                                }}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </NotificationContext.Provider>
    );
};

const KtvMessageToast = ({ notification, currentScreen, onRedirect }: { notification: Notification, currentScreen: string, onRedirect: () => void }) => {
    const isLocked = ['REVIEW', 'HANDOVER'].includes(currentScreen);
    const type = notification.type?.toUpperCase();
    const isComplaint = type === 'COMPLAINT';
    
    return (
        <motion.div
            initial={{ y: -50, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -50, opacity: 0, scale: 0.9 }}
            onClick={() => !isLocked && onRedirect()}
            className={`pointer-events-auto p-4 rounded-[24px] shadow-2xl border-2 flex items-center gap-4 transition-all active:scale-95
                ${isComplaint ? 'bg-rose-600 border-rose-500 text-white' : 'bg-white/95 backdrop-blur-md border-emerald-100 text-slate-800'}
                ${isLocked ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
        >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isComplaint ? 'bg-white/20' : 'bg-emerald-500'}`}>
                {isComplaint ? <ShieldAlert size={20} /> : <Star size={20} className="text-white fill-white" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-[9px] font-black uppercase tracking-widest opacity-70 mb-0.5 ${isComplaint ? 'text-rose-100' : 'text-emerald-600'}`}>
                    {isComplaint ? 'Thông báo khẩn' : 'Phần thưởng mới'}
                </p>
                <p className="text-xs font-bold leading-tight truncate">{notification.message}</p>
            </div>
            {!isLocked && <ArrowRight size={16} className="opacity-40" />}
        </motion.div>
    );
};

const Toast = ({ 
    notification, 
    onClose, 
    onMarkDone, 
    onRedirect 
}: { 
    notification: Notification, 
    onClose: () => void, 
    onMarkDone: () => void,
    onRedirect: () => void
}) => {
    const { role } = useAuth();
    const [confirmLoading, setConfirmLoading] = React.useState<'confirm' | 'reject' | null>(null);

    const type = notification.type?.toUpperCase();
    const isCritical = type === 'EMERGENCY' || type === 'SOS' || type === 'COMPLAINT';
    const isEarlyExit = type === 'EARLY_EXIT';
    const isWater = type === 'WATER';
    const isBuyMore = type === 'BUY_MORE' || type === 'ADD_SERVICE' || type === 'NORMAL';
    const isReward = type === 'REWARD';
    const isNewOrder = type === 'NEW_ORDER';
    const isCheckIn = type === 'CHECK_IN';

    // Parse attendanceId from message tag [AID:uuid] — bookingId FK cannot be used
    const aidMatch = notification.message?.match(/\[AID:([a-f0-9-]+)\]/i);
    const attendanceId = aidMatch?.[1] ?? null;
    // Clean message: hide the [AID:...] tag from UI
    const displayMessage = notification.message?.replace(/\s*\[AID:[a-f0-9-]+\]/i, '') ?? '';

    const isAdminCheckIn = isCheckIn && !!attendanceId && (role?.id === 'admin' || role?.id === 'reception');

    const handleAttendanceAction = async (action: 'CONFIRM' | 'REJECT') => {
        setConfirmLoading(action === 'CONFIRM' ? 'confirm' : 'reject');
        try {
            await fetch('/api/ktv/attendance/confirm', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendanceId, action }),
            });
        } catch (e) {
            console.error('[Toast] Confirm error:', e);
        } finally {
            setConfirmLoading(null);
            onMarkDone();
            onClose();
        }
    };

    let bgColor = notification.isRead ? 'bg-gray-50/90' : 'bg-white';
    let borderColor = notification.isRead ? 'border-gray-200' : 'border-slate-200';
    let icon = <Bell className={notification.isRead ? 'text-gray-400' : 'text-slate-500'} size={20} />;
    let title = 'Thông báo';

    if (isCritical) {
        bgColor = notification.isRead ? 'bg-rose-900/40' : 'bg-rose-600';
        borderColor = 'border-rose-500';
        icon = <ShieldAlert className="text-white animate-pulse" size={22} />;
        title = type === 'COMPLAINT' ? '🚨 Đánh giá tệ' : '🆘 Khẩn cấp';
    } else if (isEarlyExit) {
        bgColor = notification.isRead ? 'bg-amber-100/40' : 'bg-amber-50';
        borderColor = 'border-amber-200';
        icon = <AlertTriangle className="text-amber-600" size={20} />;
        title = '🏃 Khách về sớm';
    } else if (isWater) {
        bgColor = notification.isRead ? 'bg-sky-100/40' : 'bg-sky-50';
        borderColor = 'border-sky-200';
        icon = <Info className="text-sky-600" size={20} />;
        title = '💧 Khách gọi nước';
    } else if (isBuyMore) {
        bgColor = notification.isRead ? 'bg-violet-100/40' : 'bg-violet-50';
        borderColor = 'border-violet-200';
        icon = <CheckCircle className="text-violet-600" size={20} />;
        title = '✨ Khách mua thêm';
    } else if (isReward) {
        bgColor = notification.isRead ? 'bg-emerald-100/40' : 'bg-emerald-50';
        borderColor = 'border-emerald-200';
        icon = <CheckCircle className="text-emerald-600" size={20} />;
        title = '🎁 Bạn nhận thưởng';
    } else if (isNewOrder) {
        bgColor = notification.isRead ? 'bg-blue-100/40' : 'bg-blue-50';
        borderColor = 'border-blue-200';
        icon = <Bell className="text-blue-600" size={20} />;
        title = '📋 Đơn hàng mới';
    } else if (isCheckIn) {
        bgColor = notification.isRead ? 'bg-violet-100/40' : 'bg-violet-50';
        borderColor = 'border-violet-200';
        icon = <MapPin className="text-violet-600" size={20} />;
        title = '📍 KTV điểm danh';
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border transition-all duration-500 ${bgColor} ${borderColor} flex gap-4 items-center ${notification.isRead ? 'opacity-60 scale-[0.98]' : ''} ${isCritical && !notification.isRead ? 'ring-4 ring-rose-500/20' : ''}`}
        >
            <div className={`p-2 rounded-xl shrink-0 ${isCritical ? (notification.isRead ? 'bg-white/10' : 'bg-white/20') : 'bg-white shadow-sm'}`}>
                {icon}
            </div>
            
            <div 
                className="flex-1 min-w-0 cursor-pointer"
                onClick={onRedirect}
            >
                <div className="flex items-center gap-2 mb-1">
                    <p className={`text-[10px] font-black uppercase tracking-widest ${isCritical ? 'text-rose-100' : 'text-slate-500'}`}>
                        {title}
                    </p>
                    {notification.isRead && (
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${isCritical ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>
                            ĐÃ XỬ LÝ
                        </span>
                    )}
                </div>
                <p className={`text-sm font-bold leading-tight ${isCritical ? 'text-white' : 'text-slate-800'} ${notification.isRead ? 'line-through opacity-70' : ''} break-words`}>
                    {displayMessage}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                    <p className={`text-[9px] font-bold opacity-60 ${isCritical ? 'text-rose-100' : 'text-slate-400'}`}>
                        {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {isCritical && !notification.isRead && (
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {/* CHECK_IN: admin xác nhận / từ chối */}
                {isAdminCheckIn && !notification.isRead && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleAttendanceAction('CONFIRM'); }}
                            disabled={!!confirmLoading}
                            className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all hover:scale-110 shadow-sm disabled:opacity-50"
                            title="Xác nhận điểm danh"
                        >
                            {confirmLoading === 'confirm' ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleAttendanceAction('REJECT'); }}
                            disabled={!!confirmLoading}
                            className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-all hover:scale-110 shadow-sm disabled:opacity-50"
                            title="Từ chối điểm danh"
                        >
                            {confirmLoading === 'reject' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                        </button>
                    </>
                )}
                {/* Normal notifications: tích xanh */}
                {!isAdminCheckIn && !notification.isRead && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onMarkDone();
                            onClose();
                        }}
                        className={`p-2 rounded-xl transition-all hover:scale-110 shadow-sm ${isCritical ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                        title="Đánh dấu hoàn thành"
                    >
                        <Check size={16} strokeWidth={3} />
                    </button>
                )}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    className={`p-1 rounded-lg transition-colors ${isCritical ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 text-slate-400'}`}
                >
                    <X size={16} />
                </button>
            </div>
        </motion.div>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};
