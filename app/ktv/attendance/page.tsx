'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    ShieldAlert, MapPin, Clock, CheckCircle2,
    ExternalLink, Loader2, XCircle, LogOut, LogIn, Camera
} from 'lucide-react';
import { format } from 'date-fns';
import { useKTVAttendance } from './Attendance.logic';
import { t } from './Attendance.i18n';

const KTVAttendancePage = () => {
    const {
        checkStatus,
        currentRecord,
        errorMsg,
        mounted,
        initialLoading,
        mapsUrl,
        canAccessPage,
        handleAttendance,
        handleRetry,
    } = useKTVAttendance();

    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [formType, setFormType] = React.useState<'CHECK_IN' | 'CHECK_OUT' | 'LATE_CHECKIN' | 'OFF_REQUEST'>('CHECK_IN');
    const [photoSrc, setPhotoSrc] = React.useState<string | null>(null);
    const [reason, setReason] = React.useState<string>('');

    if (!mounted) return null;

    if (!canAccessPage) {
        return (
            <AppLayout title="Chấm Công">
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <ShieldAlert size={48} className="text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">{t.noAccess}</h2>
                </div>
            </AppLayout>
        );
    }

    const openForm = (type: 'CHECK_IN' | 'CHECK_OUT' | 'LATE_CHECKIN' | 'OFF_REQUEST') => {
        setFormType(type);
        setPhotoSrc(null);
        setReason('');
        setIsFormOpen(true);
    };

    const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setPhotoSrc(ev.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmitForm = () => {
        setIsFormOpen(false);
        handleAttendance(formType, photoSrc, reason);
    };

    return (
        <AppLayout title="Chấm Công">
            <div className="max-w-sm mx-auto px-4 py-8 space-y-6 relative">
                <div>
                    <p className="text-sm text-gray-500">{t.pageSubtitle}</p>
                </div>

                <div className="bg-white rounded-3xl border border-gray-100 shadow-lg p-8 flex flex-col items-center gap-6">

                    {/* INITIAL LOADING */}
                    {initialLoading && (
                        <>
                            <div className="w-24 h-24 rounded-full bg-gray-50 flex items-center justify-center">
                                <Loader2 size={40} className="text-gray-400 animate-spin" />
                            </div>
                            <p className="text-sm text-gray-500 font-medium">{t.loadingStatus}</p>
                        </>
                    )}

                    {/* IDLE */}
                    {!initialLoading && checkStatus === 'IDLE' && (
                        <>
                            <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center relative">
                                <LogIn size={40} className="text-emerald-600" />
                            </div>
                            <div className="text-center">
                                <p className="font-semibold text-gray-800">{t.startShift}</p>
                                <p className="text-sm text-gray-400 mt-1">Yêu cầu chụp ảnh tại cơ sở</p>
                            </div>
                            <div className="w-full space-y-3">
                                <button
                                    onClick={() => openForm('CHECK_IN')}
                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-lg rounded-2xl transition-all shadow-md shadow-emerald-200"
                                >
                                    Điểm Danh VÀO CA
                                </button>
                                <div className="grid grid-cols-2 gap-3 mt-4">
                                    <button
                                        onClick={() => openForm('LATE_CHECKIN')}
                                        className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium text-sm rounded-xl transition-all border border-gray-200"
                                    >
                                        Bổ Sung
                                    </button>
                                    <button
                                        onClick={() => openForm('OFF_REQUEST')}
                                        className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 font-medium text-sm rounded-xl transition-all border border-rose-200"
                                    >
                                        Xin OFF
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* LOADING GPS */}
                    {!initialLoading && checkStatus === 'LOADING_GPS' && (
                        <>
                            <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center">
                                <MapPin size={40} className="text-blue-400 animate-bounce" />
                            </div>
                            <div className="flex items-center gap-2 text-blue-600 font-medium">
                                <Loader2 size={18} className="animate-spin" />
                                Đang tải GPS và Ảnh...
                            </div>
                        </>
                    )}

                    {/* PENDING */}
                    {!initialLoading && checkStatus === 'PENDING' && (
                        <>
                            <div className="w-24 h-24 rounded-full bg-amber-50 flex items-center justify-center">
                                <Clock size={40} className="text-amber-500 animate-pulse" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="font-bold text-amber-700 text-lg">{t.pendingTitle}</p>
                                <p className="text-sm text-gray-500">{t.pendingDesc}</p>
                                {mapsUrl && (
                                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700 mt-2">
                                        <MapPin size={13} /> {t.viewLocation} <ExternalLink size={11} />
                                    </a>
                                )}
                                {currentRecord?.checkedAt && (
                                    <p className="text-xs text-gray-400 mt-1">
                                        {t.sentAt(format(new Date(currentRecord.checkedAt), 'HH:mm:ss dd/MM/yyyy'))}
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    {/* CONFIRMED */}
                    {!initialLoading && checkStatus === 'CONFIRMED' && (
                        <>
                            <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center">
                                <CheckCircle2 size={40} className="text-emerald-600" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="font-bold text-emerald-700 text-lg">{t.confirmedTitle}</p>
                                <p className="text-sm text-gray-500">{t.confirmedDesc}</p>
                                {mapsUrl && (
                                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700">
                                        <MapPin size={13} /> {t.viewMapLocation} <ExternalLink size={11} />
                                    </a>
                                )}
                                {currentRecord?.checkedAt && (
                                    <p className="text-xs text-gray-400">
                                        {t.shiftStart(format(new Date(currentRecord.checkedAt), 'HH:mm — dd/MM/yyyy'))}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => openForm('CHECK_OUT')}
                                className="w-full py-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-lg rounded-2xl transition-all shadow-md shadow-rose-200 flex items-center justify-center gap-2"
                            >
                                <LogOut size={22} /> {t.checkOut}
                            </button>
                        </>
                    )}

                    {/* REJECTED */}
                    {!initialLoading && checkStatus === 'REJECTED' && (
                        <>
                            <div className="w-24 h-24 rounded-full bg-red-50 flex items-center justify-center">
                                <XCircle size={40} className="text-red-500" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="font-bold text-red-700 text-lg">{t.rejectedTitle}</p>
                                <p className="text-sm text-gray-500">{t.rejectedDesc}</p>
                            </div>
                            <button
                                onClick={handleRetry}
                                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-2xl transition-all"
                            >
                                {t.retry}
                            </button>
                        </>
                    )}

                    {/* CHECKED OUT */}
                    {!initialLoading && checkStatus === 'CHECKED_OUT' && (
                        <>
                            <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center">
                                <LogOut size={40} className="text-slate-500" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="font-bold text-slate-700 text-lg">{t.checkedOutTitle}</p>
                                <p className="text-sm text-gray-400">{t.checkedOutDesc}</p>
                            </div>
                        </>
                    )}

                    {/* Error */}
                    {errorMsg && (
                        <div className="w-full bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">
                            {errorMsg}
                        </div>
                    )}
                </div>

                {/* FORM MODAL */}
                {isFormOpen && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
                            <h3 className="text-lg font-black text-gray-900 text-center uppercase tracking-wide">
                                {formType === 'CHECK_IN' ? 'Điểm danh vào ca' :
                                 formType === 'CHECK_OUT' ? 'Điểm danh tan ca' :
                                 formType === 'LATE_CHECKIN' ? 'Điểm danh bổ sung' :
                                 'Đăng ký OFF'}
                            </h3>
                            
                            {/* Camera input */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 block">Chụp ảnh minh chứng (*)</label>
                                {!photoSrc ? (
                                    <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 focus:ring-2 focus:ring-emerald-500 transition-all rounded-2xl cursor-pointer">
                                        <Camera size={36} className="text-gray-400 mb-2" />
                                        <span className="text-sm font-medium text-gray-500">Mở Camera Điện Thoại</span>
                                        <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleCapture} />
                                    </label>
                                ) : (
                                    <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-black/5 flex items-center justify-center border border-gray-200">
                                        <img src={photoSrc} className="w-full h-full object-cover" />
                                        <button onClick={() => setPhotoSrc(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full shadow-lg hover:bg-black/70 transition-colors">
                                            <XCircle size={20} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Reason input */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 block text-left">
                                    Lý do/Ghi chú {(formType === 'OFF_REQUEST' || formType === 'LATE_CHECKIN') && <span className="text-rose-500">(*)</span>}
                                </label>
                                <textarea 
                                    value={reason} onChange={e => setReason(e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl min-h-[80px] max-h-32 p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-y" 
                                    placeholder="Nhập ghi chú (nếu có)..."
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setIsFormOpen(false)} className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors">Hủy</button>
                                <button 
                                   onClick={handleSubmitForm}
                                   disabled={!photoSrc || ((formType === 'OFF_REQUEST' || formType === 'LATE_CHECKIN') && !reason.trim())}
                                   className="flex-1 py-3.5 bg-emerald-600 active:scale-95 transition-transform text-white rounded-xl font-bold disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2">
                                    <CheckCircle2 size={18} /> Gửi
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </AppLayout>
    );
};

export default KTVAttendancePage;
