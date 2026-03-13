'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, ShieldAlert, X, CheckCircle, Info, AlertTriangle, Check } from 'lucide-react';
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
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// --- CONFIG ---
const SOUND_MAP: Record<string, string> = {
    'EMERGENCY': '/sounds/quay-bao-khan-cap.wav',
    'COMPLAINT': '/sounds/quay-danh-gia-te.wav',
    'EARLY_EXIT': '/sounds/quay-khach-ve-som.wav',
    'WATER': '/sounds/reception-notification.wav',
    'BUY_MORE': '/sounds/reception-notification.wav',
    'SUPPORT': '/sounds/reception-notification.wav',
    'NEW_ORDER': '/sounds/quay-don-hang-moi.wav', // Mặc định cho quầy
    'KTV_NEW_ORDER': '/sounds/ktv-don-hang-moi.wav',
    'REWARD': '/sounds/ktv-nhan-thuong.wav',
    'default': '/sounds/reception-notification.wav'
};

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, role } = useAuth();
    const [toastQueue, setToastQueue] = useState<Notification[]>([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
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
        // REMOVED: Auto-dismiss setTimeout as per user request
    };

    const removeToast = (id: string) => {
        setToastQueue(prev => prev.filter(n => n.id !== id));
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

        // 1. Lắng nghe thông báo chung (StaffNotifications)
        const channel = supabase
            .channel('global_notifications')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'StaffNotifications' 
            }, (payload) => {
                const newNotif = payload.new as Notification;
                console.log('🔔 [NotificationProvider] New notification received:', newNotif);
                
                // Logic lọc thông báo theo Role
                if (roleId === 'admin') {
                    // Admin chỉ nhận thông báo chung (không dành riêng cho KTV) hoặc khiếu nại
                    const isGlobal = !newNotif.employeeId;
                    const isComplaint = newNotif.type === 'COMPLAINT';
                    
                    if (isGlobal || isComplaint) {
                        addToast(newNotif);
                    }
                } else if (isKtv && newNotif.employeeId === user.id) {
                    // KTV luôn được phát âm thanh cho mọi thông báo gán cho mình
                    playSound(newNotif.type);
                    
                    // Nhưng chỉ hiện Toast nếu không phải là REWARD (vì REWARD đã có UI riêng trên Dashboard)
                    if (newNotif.type !== 'REWARD') {
                        console.log('✅ [NotificationProvider] Matching technician! Adding toast.');
                        addToast(newNotif, false); // false để không playSound lần 2 trong addToast
                    }
                } else if (isReception && (!newNotif.employeeId || newNotif.employeeId === '')) {
                    // Lễ tân nhận thông báo không gán cho ai (thông báo chung cho quầy)
                    addToast(newNotif);
                } else {
                    console.log('⏭️ [NotificationProvider] Notification ignored by filter:', { 
                        roleId, 
                        userId: user.id, 
                        notifTech: newNotif.employeeId 
                    });
                }
            })
            .subscribe();

        return () => {
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
            playSound
        }}>
            {children}
            
            {/* TOAST UI */}
            <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[9999] flex flex-col gap-3 pointer-events-none">
                <AnimatePresence>
                    {sortedToasts.map((n) => (
                        <Toast 
                            key={n.id} 
                            notification={n} 
                            onClose={() => removeToast(n.id)} 
                            onMarkDone={() => markAsRead(n.id)}
                            onRedirect={() => {
                                if (role?.id === 'admin' || role?.id === 'reception') {
                                    router.push('/reception/dispatch');
                                } else if (role?.id === 'ktv') {
                                    router.push('/ktv/dashboard');
                                }
                            }}
                        />
                    ))}
                </AnimatePresence>
            </div>
        </NotificationContext.Provider>
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
    const type = notification.type?.toUpperCase();
    const isCritical = type === 'EMERGENCY' || type === 'COMPLAINT';
    const isEarlyExit = type === 'EARLY_EXIT';
    const isWater = type === 'WATER';
    const isBuyMore = type === 'BUY_MORE';
    const isReward = type === 'REWARD';
    const isNewOrder = type === 'NEW_ORDER';

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
                    {notification.message}
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
                {!notification.isRead && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onMarkDone();
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
