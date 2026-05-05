'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useFinanceKTV } from './FinanceKTV.logic';
import { ShieldAlert, CheckCircle, Clock, XCircle, RefreshCcw, Banknote, Edit3 } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

export default function FinanceKTVPage() {
    const { 
        user, canAccessPage, withdrawals, summaries, isLoading, isProcessing, 
        handleApprove, handleReject, refresh,
        isAdjustmentModalOpen, selectedKtv, adjAmount, setAdjAmount, adjType, setAdjType, adjReason, setAdjReason, setIsAdjustmentModalOpen, handleOpenAdjustment, handleSubmitAdjustment
    } = useFinanceKTV();

    if (!user || !canAccessPage) {
        return (
            <AppLayout title="Quản lý Tài chính KTV">
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <ShieldAlert size={48} className="text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
                    <p className="text-gray-500">Bạn cần được cấp quyền "Thu Ngân KTV" để xem trang này.</p>
                </div>
            </AppLayout>
        );
    }

    const pendingRequests = withdrawals.filter(w => w.status === 'PENDING');
    const historyRequests = withdrawals.filter(w => w.status !== 'PENDING').slice(0, 20);

    return (
        <AppLayout title="Thu Ngân - Thanh toán KTV">
            <div className="p-4 max-w-5xl mx-auto space-y-8">
                
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800">Quầy Giao Tiền KTV</h1>
                        <p className="text-sm text-slate-500">Xác nhận giao tiền mặt cho các lệnh rút tiền của Kỹ thuật viên</p>
                    </div>
                    <button 
                        onClick={refresh}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
                    >
                        <RefreshCcw size={16} className={isLoading ? "animate-spin" : ""} />
                        Làm mới
                    </button>
                </div>

                {/* 🔴 DANH SÁCH CHỜ GIAO TIỀN */}
                <div>
                    <h2 className="text-lg font-bold text-rose-600 mb-4 flex items-center gap-2 uppercase tracking-widest text-sm">
                        <Clock size={18} /> Đang chờ ra quầy lấy tiền ({pendingRequests.length})
                    </h2>

                    {pendingRequests.length === 0 ? (
                        <div className="bg-slate-50 border border-slate-100 rounded-3xl p-10 text-center">
                            <Banknote size={48} className="text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-500 font-medium">Hiện tại không có KTV nào yêu cầu rút tiền.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pendingRequests.map(req => (
                                <div key={req.id} className="bg-white rounded-3xl p-6 border-2 border-rose-100 shadow-xl shadow-rose-900/5 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-rose-400 to-amber-400" />
                                    
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Mã KTV</p>
                                            <h3 className="text-xl font-black text-slate-800">{req.staff_id}</h3>
                                            <p className="text-xs font-bold text-slate-400">{req.Staff?.full_name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Giờ yêu cầu</p>
                                            <p className="text-sm font-bold text-slate-600">
                                                {format(new Date(req.request_date), 'HH:mm - dd/MM')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-rose-50 rounded-2xl p-4 mb-6 flex items-center justify-between">
                                        <span className="text-xs font-black text-rose-800 uppercase tracking-widest">Số tiền cần đưa</span>
                                        <span className="text-2xl font-black text-rose-600 tracking-tight">{req.amount.toLocaleString()}đ</span>
                                    </div>

                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleApprove(req.id, req.amount)}
                                            disabled={isProcessing}
                                            className="flex-1 py-3.5 bg-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-rose-200 disabled:opacity-50"
                                        >
                                            XÁC NHẬN ĐÃ GIAO TIỀN
                                        </button>
                                        <button 
                                            onClick={() => handleReject(req.id)}
                                            disabled={isProcessing}
                                            className="px-4 py-3.5 bg-white border-2 border-slate-100 text-slate-400 rounded-xl hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50"
                                            title="Từ chối / Hủy lệnh"
                                        >
                                            <XCircle size={20} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 🟢 LỊCH SỬ ĐÃ XỬ LÝ */}
                <div className="pt-8">
                    <h2 className="text-lg font-bold text-slate-600 mb-4 flex items-center gap-2 uppercase tracking-widest text-sm">
                        <CheckCircle size={18} /> Lịch sử giao dịch gần đây
                    </h2>

                    <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-black">
                                <tr>
                                    <th className="px-6 py-4">KTV</th>
                                    <th className="px-6 py-4">Số tiền</th>
                                    <th className="px-6 py-4">Thời gian tạo</th>
                                    <th className="px-6 py-4">Trạng thái</th>
                                    <th className="px-6 py-4">Thu ngân xác nhận</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 font-medium">
                                {historyRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">Không có giao dịch nào gần đây</td>
                                    </tr>
                                ) : (
                                    historyRequests.map((req) => (
                                        <tr key={req.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-4">
                                                <span className="font-bold text-slate-800">{req.staff_id}</span>
                                                <span className="text-xs text-slate-400 ml-2">{req.Staff?.full_name}</span>
                                            </td>
                                            <td className="px-6 py-4 font-black text-slate-700">{req.amount.toLocaleString()}đ</td>
                                            <td className="px-6 py-4 text-slate-500">
                                                {format(new Date(req.request_date), 'HH:mm dd/MM', { locale: vi })}
                                            </td>
                                            <td className="px-6 py-4">
                                                {req.status === 'APPROVED' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold uppercase">
                                                        <CheckCircle size={12} /> Đã giao tiền
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 text-xs font-bold uppercase">
                                                        <XCircle size={12} /> Bị từ chối
                                                    </span>
                                                )}
                                                {req.note && <div className="text-[10px] text-slate-400 mt-1 max-w-[150px] truncate" title={req.note}>Lý do: {req.note}</div>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-slate-800 font-bold">{req.processed_by || '-'}</span>
                                                    {req.processed_at && (
                                                        <span className="text-[10px] text-slate-400">
                                                            {format(new Date(req.processed_at), 'HH:mm dd/MM')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 🔵 TỔNG HỢP TÀI CHÍNH KTV (PHA 3) */}
                <div className="pt-8">
                    <h2 className="text-lg font-bold text-indigo-600 mb-4 flex items-center gap-2 uppercase tracking-widest text-sm">
                        <Banknote size={18} /> Bảng thống kê Ví điện tử KTV
                    </h2>

                    <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-indigo-50 text-indigo-800 text-xs uppercase font-black whitespace-nowrap">
                                    <tr>
                                        <th className="px-6 py-4">Nhân viên</th>
                                        <th className="px-6 py-4 text-right">Tiền Tua</th>
                                        <th className="px-6 py-4 text-right">Tiền Tip</th>
                                        <th className="px-6 py-4 text-right">Thưởng/Phạt</th>
                                        <th className="px-6 py-4 text-right">Tổng thu nhập</th>
                                        <th className="px-6 py-4 text-right text-rose-600">Đã rút / Chờ</th>
                                        <th className="px-6 py-4 text-right text-emerald-600">Tiền khả dụng</th>
                                        <th className="px-6 py-4 text-center">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 font-medium">
                                    {summaries.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-8 text-center text-slate-400">Chưa có dữ liệu thống kê KTV</td>
                                        </tr>
                                    ) : (
                                        summaries.map((ktv) => (
                                            <tr key={ktv.id} className="hover:bg-indigo-50/30 whitespace-nowrap">
                                                <td className="px-6 py-4">
                                                    <span className="font-bold text-slate-800 block">{ktv.name}</span>
                                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md inline-block mt-1">{ktv.id}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right text-slate-600">{Number(ktv.total_commission || 0).toLocaleString()}đ</td>
                                                <td className="px-6 py-4 text-right text-slate-600">{Number(ktv.total_tip || 0).toLocaleString()}đ</td>
                                                <td className="px-6 py-4 text-right text-slate-600">{Number(ktv.total_adjustment || 0).toLocaleString()}đ</td>
                                                <td className="px-6 py-4 text-right font-black text-slate-800">{Number(ktv.gross_income || 0).toLocaleString()}đ</td>
                                                <td className="px-6 py-4 text-right text-rose-600">
                                                    <span className="font-bold">{Number(ktv.total_withdrawn || 0).toLocaleString()}đ</span>
                                                    {Number(ktv.total_pending || 0) > 0 && (
                                                        <span className="block text-[10px] text-amber-500 mt-0.5">(+{Number(ktv.total_pending).toLocaleString()}đ)</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-emerald-600">
                                                    {Number(ktv.available_balance || 0).toLocaleString()}đ
                                                    <span className="block text-[9px] text-slate-400 font-bold mt-0.5" title="Bao gồm cọc">
                                                        - Cọc {(Number(ktv.min_deposit || 500000) / 1000)}k
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button 
                                                        onClick={() => handleOpenAdjustment(ktv.id, ktv.name)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-bold transition-colors"
                                                    >
                                                        <Edit3 size={14} /> Thưởng / Phạt
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* MODAL THƯỞNG PHẠT */}
                {isAdjustmentModalOpen && selectedKtv && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                            <div className="bg-indigo-600 p-6 text-center relative">
                                <button 
                                    onClick={() => setIsAdjustmentModalOpen(false)}
                                    className="absolute top-4 right-4 text-white/50 hover:text-white"
                                >
                                    <XCircle size={24} />
                                </button>
                                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Edit3 size={32} className="text-white" />
                                </div>
                                <h3 className="text-xl font-black text-white">Điều chỉnh Thu Nhập</h3>
                                <p className="text-indigo-200 text-sm mt-1">KTV: {selectedKtv.name} ({selectedKtv.id})</p>
                            </div>
                            
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Loại điều chỉnh</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button 
                                            onClick={() => setAdjType('GIFT')}
                                            className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${adjType === 'GIFT' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 text-slate-400'}`}
                                        >
                                            Thưởng (+)
                                        </button>
                                        <button 
                                            onClick={() => setAdjType('PENALTY')}
                                            className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${adjType === 'PENALTY' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-100 text-slate-400'}`}
                                        >
                                            Phạt (-)
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Số tiền (VNĐ)</label>
                                    <input 
                                        type="text" 
                                        value={adjAmount}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                            if (val) {
                                                setAdjAmount(Number(val).toLocaleString());
                                            } else {
                                                setAdjAmount('');
                                            }
                                        }}
                                        placeholder="Ví dụ: 500,000"
                                        className="w-full text-center text-2xl font-black text-slate-800 border-2 border-slate-200 rounded-2xl py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Lý do</label>
                                    <textarea 
                                        value={adjReason}
                                        onChange={(e) => setAdjReason(e.target.value)}
                                        placeholder="Nhập lý do thưởng/phạt..."
                                        rows={3}
                                        className="w-full text-sm text-slate-800 border-2 border-slate-200 rounded-2xl p-4 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                                    />
                                </div>

                                <button 
                                    onClick={handleSubmitAdjustment}
                                    disabled={isProcessing || !adjAmount || !adjReason}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {isProcessing ? 'Đang xử lý...' : 'Xác nhận'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </AppLayout>
    );
}
