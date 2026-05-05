'use client';

import React, { useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useKTVWallet } from './KTVWallet.logic';
import { Zap, Clock, Banknote, TrendingDown, TrendingUp, Gift, Calendar } from 'lucide-react';

const THEME = {
  primary: 'bg-emerald-600',
  primaryMuted: 'bg-emerald-50',
  primaryText: 'text-emerald-600',
  textBase: 'text-slate-800',
  textMuted: 'text-slate-500',
  bgCard: 'bg-white',
  bgBody: 'bg-slate-50',
  border: 'border-slate-200',
  radius: 'rounded-[32px]'
};

export default function KTVWalletPage() {
    const { user, canViewWallet, walletBalance, walletTimeline, isLoading, handleWithdraw } = useKTVWallet();

    const groupedTimeline = useMemo(() => {
        if (!walletTimeline) return [];
        const groups: Record<string, any[]> = {};
        walletTimeline.forEach((item: any) => {
            const dateStr = new Date(item.created_at).toLocaleDateString('vi-VN', {
                weekday: 'long',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(item);
        });
        return Object.entries(groups).map(([date, items]) => ({ date, items }));
    }, [walletTimeline]);

    if (!user || !canViewWallet) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center h-screen bg-slate-50">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <TrendingDown size={32} />
                        </div>
                        <h1 className="text-2xl font-black text-slate-800 mb-2">Truy cập bị từ chối</h1>
                        <p className="text-slate-500">Bạn không có quyền truy cập vào Ví điện tử KTV.</p>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="p-4 lg:p-8 space-y-6 max-w-2xl mx-auto pb-32">
                <div className="flex items-center justify-between mb-2">
                    <h1 className={`text-2xl font-black tracking-tight ${THEME.textBase}`}>
                        Ví Thu Nhập
                    </h1>
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        {/* Ví Thu Nhập (KTV Wallet) */}
                        {walletBalance && (
                            <div className={`p-6 rounded-[32px] shadow-lg shadow-emerald-900/10 bg-gradient-to-br from-emerald-600 to-teal-800 text-white`}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-emerald-100 flex items-center gap-2 uppercase tracking-widest text-[11px]">
                                        <Zap size={16} className="text-amber-300 fill-amber-300" />
                                        Số Dư Thực Tế
                                    </h3>
                                    <span className="text-[10px] bg-white/20 px-2 py-1 rounded-lg font-bold">VNĐ</span>
                                </div>
                                <div className="mb-5">
                                    <p className="text-[10px] text-emerald-200 uppercase tracking-widest mb-1">Khả dụng rút (Đã trừ cọc)</p>
                                    <p className="text-4xl font-black tracking-tight drop-shadow-sm">
                                        {Number(walletBalance.available_balance || 0).toLocaleString()}đ
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-xs p-3 bg-black/10 rounded-2xl mb-4">
                                    <div>
                                        <p className="text-emerald-200/70 text-[10px] uppercase mb-0.5">Tổng thu nhập</p>
                                        <p className="font-bold">{Number(walletBalance.gross_income || 0).toLocaleString()}đ</p>
                                    </div>
                                    <div>
                                        <p className="text-emerald-200/70 text-[10px] uppercase mb-0.5">Đang chờ duyệt</p>
                                        <p className="font-bold text-amber-300">{Number(walletBalance.total_pending || 0).toLocaleString()}đ</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleWithdraw}
                                    className="w-full py-3.5 bg-white text-emerald-700 font-black rounded-2xl text-xs uppercase tracking-widest active:scale-[0.98] transition-transform shadow-lg shadow-white/10 flex justify-center items-center gap-2"
                                >
                                    <Banknote size={16} /> Tạo Lệnh Rút Tiền
                                </button>
                            </div>
                        )}

                        {groupedTimeline.length > 0 ? (
                            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="font-black tracking-tight text-slate-800 text-sm uppercase flex items-center gap-2">
                                        <Clock size={16} className="text-emerald-500" /> Lịch sử giao dịch
                                    </h3>
                                    <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">
                                        Tháng {new Date().getMonth() + 1}/{new Date().getFullYear()}
                                    </span>
                                </div>
                                
                                <div className="space-y-8">
                                    {groupedTimeline.map((group, gIdx) => (
                                        <div key={gIdx} className="space-y-4 relative">
                                            <div className="sticky top-0 bg-white/90 backdrop-blur z-20 py-2 border-b border-slate-100 mb-4 flex items-center gap-2">
                                                <Calendar size={14} className="text-slate-400" />
                                                <h4 className="text-xs font-bold text-slate-600 capitalize">{group.date}</h4>
                                            </div>

                                            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-100 before:to-transparent">
                                                {group.items.map((item: any, idx: number) => {
                                                    const isPositive = Number(item.amount) >= 0;
                                                    const isWithdrawal = item.type === 'WITHDRAWAL';
                                                    const isPending = item.status === 'PENDING';
                                                    const isRejected = item.status === 'REJECTED';
                                                    return (
                                                        <div key={item.id || idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                                            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-slate-100 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${isRejected ? 'opacity-50' : ''}`}>
                                                                {item.type === 'TIP' ? <Gift size={16} className="text-emerald-500" /> :
                                                                item.type === 'COMMISSION' ? <Banknote size={16} className="text-indigo-500" /> :
                                                                item.type === 'WITHDRAWAL' ? <TrendingDown size={16} className="text-rose-500" /> :
                                                                item.type === 'GIFT' ? <TrendingUp size={16} className="text-amber-500" /> :
                                                                <Zap size={16} />}
                                                            </div>
                                                            <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-2xl border ${isRejected ? 'border-dashed border-slate-200 opacity-60' : 'border-slate-100'} shadow-sm transition-all hover:shadow-md`}>
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className={`font-bold text-xs line-clamp-1 ${isRejected ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{item.title}</span>
                                                                    <span className={`font-black text-sm whitespace-nowrap ${isRejected ? 'text-slate-400 line-through' : isWithdrawal ? 'text-rose-600' : isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                        {isPositive ? '+' : ''}{Number(item.amount).toLocaleString()}đ
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center justify-between mt-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] text-slate-400 font-medium">
                                                                            {new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                        {item.type !== 'TIP' && !isRejected && (
                                                                            <span className="text-[10px] text-slate-400 font-medium border-l border-slate-200 pl-2">
                                                                                Số dư: <span className="font-bold text-slate-600">{Number(item.running_balance || 0).toLocaleString()}đ</span>
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex gap-1">
                                                                        {isPending && (
                                                                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Chờ duyệt</span>
                                                                        )}
                                                                        {item.type === 'WITHDRAWAL' && item.status === 'APPROVED' && (
                                                                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Đã nhận</span>
                                                                        )}
                                                                        {isRejected && (
                                                                            <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Từ chối</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {item.note && <div className={`mt-2 text-[10px] p-2 rounded-lg ${isRejected ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500'}`}>{item.note}</div>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center">
                                <Clock className="mx-auto text-slate-300 mb-4" size={32} />
                                <h3 className="text-sm font-bold text-slate-600 mb-1">Chưa có giao dịch</h3>
                                <p className="text-xs text-slate-400">Các giao dịch tài chính của bạn sẽ xuất hiện tại đây.</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppLayout>
    );
}
