'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { 
    Bell, 
    Check, 
    Clock, 
    Filter, 
    Search, 
    Smartphone, 
    ExternalLink, 
    Calendar,
    ChevronLeft,
    ChevronRight,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';

// --- TYPES ---
interface NotificationItem {
    id: string;
    bookingId?: string;
    type: string;
    message: string;
    isRead: boolean;
    createdAt: string;
    employeeId?: string;
}

const PAGE_SIZE = 15;

export default function NotificationHistoryPage() {
    const { role } = useAuth();
    const router = useRouter();
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);

    const fetchNotifications = async () => {
        setIsLoading(true);
        console.log('📡 [NotifHistory] Fetching with filter:', { filterStatus, selectedDate, page });
        
        try {
            let query = supabase
                .from('StaffNotifications')
                .select('*', { count: 'exact' })
                .order('isRead', { ascending: true })
                .order('createdAt', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            // Filter by date if selected
            if (selectedDate) {
                const startOfDay = `${selectedDate}T00:00:00Z`;
                const endOfDay = `${selectedDate}T23:59:59Z`;
                query = query.gte('createdAt', startOfDay).lte('createdAt', endOfDay);
            }

            // Filter by status
            if (filterStatus === 'pending') {
                query = query.eq('isRead', false);
            } else if (filterStatus === 'completed') {
                query = query.eq('isRead', true);
            }

            const { data, count, error } = await query;
            
            if (error) {
                console.error('❌ [NotifHistory] Error fetching notifications:', error);
            } else {
                setNotifications(data || []);
                setTotalCount(count || 0);
            }
        } catch (err) {
            console.error('❌ [NotifHistory] Critical error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [selectedDate, filterStatus, page]);

    const handleMarkDone = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase
            .from('StaffNotifications')
            .update({ isRead: !currentStatus })
            .eq('id', id);

        if (!error) {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: !currentStatus } : n));
        }
    };

    const filteredNotifs = useMemo(() => {
        return notifications.filter(n => 
            n.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
            n.type.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [notifications, searchTerm]);

    const stats = useMemo(() => {
        const pending = notifications.filter(n => !n.isRead).length;
        return {
            pending,
            totalToday: totalCount
        };
    }, [notifications, totalCount]);

    return (
        <AppLayout>
            <div className="min-h-screen bg-slate-50/50 p-4 lg:p-8">
                {/* Header */}
                <div className="max-w-6xl mx-auto space-y-8">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                                    <Bell className="text-white" size={20} />
                                </div>
                                <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Lịch sử Thông báo</h1>
                            </div>
                            <p className="text-gray-500 font-medium ml-13">Theo dõi và xử lý các yêu cầu từ nhân viên và khách hàng</p>
                        </div>

                        <div className="flex items-center gap-3">
                            <button 
                                onClick={fetchNotifications}
                                className="p-3 bg-white hover:bg-slate-50 border border-gray-100 rounded-2xl text-indigo-600 transition-all flex items-center gap-2 font-bold text-xs uppercase"
                            >
                                <Loader2 size={16} className={isLoading ? 'animate-spin' : ''} />
                                Làm mới
                            </button>
                            <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2">
                                <Calendar size={18} className="text-indigo-600 ml-2" />
                                <input 
                                    type="date" 
                                    value={selectedDate || ''}
                                    onChange={(e) => setSelectedDate(e.target.value || null)}
                                    className="border-none focus:ring-0 text-sm font-bold text-gray-700 bg-transparent"
                                />
                                {selectedDate && (
                                    <button 
                                        onClick={() => setSelectedDate(null)}
                                        className="text-[10px] font-black text-rose-500 px-2 py-1 bg-rose-50 rounded-lg uppercase"
                                    >
                                        Xoá ngày
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Stats & Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3 bg-white rounded-[2.5rem] p-4 shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
                            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                                {(['all', 'pending', 'completed'] as const).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => { setFilterStatus(s); setPage(0); }}
                                        className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                            filterStatus === s 
                                            ? 'bg-white text-indigo-600 shadow-sm' 
                                            : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        {s === 'all' ? 'Tất cả' : s === 'pending' ? 'Chưa xử lý' : 'Đã xong'}
                                    </button>
                                ))}
                            </div>
                            <div className="flex-1 min-w-[200px] relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text"
                                    placeholder="Tìm kiếm nội dung thông báo..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-[2.5rem] p-6 text-white shadow-xl shadow-indigo-100 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Cần xử lý</p>
                                <p className="text-3xl font-black">{stats.pending}</p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                                <Clock className="animate-pulse" size={24} />
                            </div>
                        </div>
                    </div>

                    {/* List */}
                    <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                            <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm">Danh sách yêu cầu</h3>
                            <div className="flex items-center gap-2">
                                <button 
                                    disabled={page === 0}
                                    onClick={() => setPage(p => p - 1)}
                                    className="p-2 hover:bg-slate-50 rounded-xl disabled:opacity-30 transition-colors"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span className="text-xs font-black text-gray-400">TRANG {page + 1}</span>
                                <button 
                                    disabled={(page + 1) * PAGE_SIZE >= totalCount}
                                    onClick={() => setPage(p => p + 1)}
                                    className="p-2 hover:bg-slate-50 rounded-xl disabled:opacity-30 transition-colors"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="divide-y divide-gray-50">
                            {isLoading ? (
                                <div className="p-20 flex flex-col items-center justify-center gap-4">
                                    <Loader2 className="text-indigo-600 animate-spin" size={40} />
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Đang tải dữ liệu...</p>
                                </div>
                            ) : filteredNotifs.length === 0 ? (
                                <div className="p-20 flex flex-col items-center justify-center text-center">
                                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                                        <Bell className="text-slate-200" size={32} />
                                    </div>
                                    <h4 className="text-gray-400 font-black uppercase tracking-widest">Không có thông báo nào</h4>
                                    <p className="text-sm text-gray-300 mt-2">Thử thay đổi bộ lọc hoặc ngày xem sao</p>
                                </div>
                            ) : (
                                filteredNotifs.map((notif) => (
                                    <NotificationRow 
                                        key={notif.id} 
                                        notif={notif} 
                                        onToggleDone={() => handleMarkDone(notif.id, notif.isRead)}
                                        onRedirect={() => router.push('/reception/dispatch')}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}

const NotificationRow = ({ 
    notif, 
    onToggleDone,
    onRedirect
}: { 
    notif: NotificationItem, 
    onToggleDone: () => void,
    onRedirect: () => void
}) => {
    const isCritical = notif.type === 'EMERGENCY' || notif.type === 'COMPLAINT';
    
    return (
        <motion.div 
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`p-6 flex items-center gap-6 transition-all hover:bg-slate-50/50 ${notif.isRead ? 'opacity-60' : ''}`}
        >
            {/* Status Check */}
            <button 
                onClick={onToggleDone}
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all border-2 ${
                    notif.isRead 
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-100' 
                    : 'bg-white border-slate-100 text-slate-200 hover:border-emerald-300 hover:text-emerald-500'
                }`}
            >
                <Check size={20} strokeWidth={3} />
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${
                        isCritical ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                        {notif.type}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                <h4 className={`text-base font-bold text-gray-900 tracking-tight ${notif.isRead ? 'line-through decoration-gray-400' : ''}`}>
                    {notif.message}
                </h4>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button 
                    onClick={onRedirect}
                    className="p-3 bg-white border border-gray-100 rounded-2xl text-indigo-600 hover:bg-indigo-50 hover:border-indigo-100 transition-all active:scale-95 group"
                    title="Đi tới Điều phối"
                >
                    <ExternalLink size={20} className="group-hover:rotate-12 transition-transform" />
                </button>
            </div>
        </motion.div>
    );
}

