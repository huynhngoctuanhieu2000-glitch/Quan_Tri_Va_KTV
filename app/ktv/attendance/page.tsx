'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    ShieldAlert, MapPin, Clock, CheckCircle2,
    ExternalLink, Loader2, XCircle, LogOut, LogIn, Camera, AlertCircle
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
        canAccessPage,
        canCheckOut,
        checkoutBlockedUntil,
        isLoadingShift,
        isLate,
        checkIsLate,
        handleAttendance,
        handleRetry,
        clearError,
        activeShiftType,
        isOffToday,
    } = useKTVAttendance();

    // 🔧 UI CONFIGURATION
    const MAX_PHOTOS = 5;

    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [formType, setFormType] = React.useState<'CHECK_IN' | 'CHECK_OUT' | 'LATE_CHECKIN'>('CHECK_IN');
    const [photos, setPhotos] = React.useState<string[]>([]);
    const [reason, setReason] = React.useState<string>('');
    const [selectedShiftType, setSelectedShiftType] = React.useState<string>('');

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

    const openForm = (type: 'CHECK_IN' | 'CHECK_OUT' | 'LATE_CHECKIN') => {
        if (type === 'CHECK_IN') {
            checkIsLate();
        }
        setFormType(type);
        setPhotos([]);
        setReason('');
        setSelectedShiftType(activeShiftType || 'FREE');
        setIsFormOpen(true);
    };

    // Compress image to reduce base64 size before upload
    const compressImage = (file: File, maxWidth = 800, quality = 0.6): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('Canvas not supported')); return; }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    };

    const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const remainingSlots = MAX_PHOTOS - photos.length;
        const filesToProcess = files.slice(0, remainingSlots);

        for (const file of filesToProcess) {
            try {
                const compressed = await compressImage(file);
                setPhotos(prev => {
                    if (prev.length < MAX_PHOTOS) return [...prev, compressed];
                    return prev;
                });
            } catch {
                // Fallback to raw FileReader if compression fails
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const result = ev.target?.result as string;
                    if (result) {
                        setPhotos(prev => {
                            if (prev.length < MAX_PHOTOS) return [...prev, result];
                            return prev;
                        });
                    }
                };
                reader.readAsDataURL(file);
            }
        }
        
        // Reset input để có thể chọn lại cùng 1 file nếu lỡ xoá
        if (e.target) {
            e.target.value = '';
        }
    };

    const handleSubmitForm = () => {
        setIsFormOpen(false);
        handleAttendance(formType, photos.length > 0 ? photos : null, reason, formType === 'CHECK_IN' ? selectedShiftType : null);
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
                                Đang kiểm tra vị trí & tải ảnh...
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
                                {currentRecord?.checkedAt && (
                                    <p className="text-xs text-gray-400">
                                        {t.shiftStart(format(new Date(currentRecord.checkedAt), 'HH:mm — dd/MM/yyyy'))}
                                    </p>
                                )}
                            </div>
                            {/* Checkout time restriction warning */}
                            {isLoadingShift ? (
                                <div className="w-full flex items-center justify-center gap-2 py-3 text-gray-400 text-sm">
                                    <Loader2 size={16} className="animate-spin" />
                                    Đang kiểm tra giờ ca...
                                </div>
                            ) : !canCheckOut && checkoutBlockedUntil ? (
                                <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-center space-y-2">
                                    <p className="text-amber-700 text-sm font-semibold">
                                        {t.cannotCheckOutYet(checkoutBlockedUntil)}
                                    </p>
                                </div>
                            ) : null}
                            <button
                                onClick={() => openForm('CHECK_OUT')}
                                disabled={!canCheckOut || isLoadingShift}
                                className="w-full py-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-lg rounded-2xl transition-all shadow-md shadow-rose-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
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

                    {/* Inline error has been moved to Modal */}
                </div>

                {/* FORM MODAL */}
                {isFormOpen && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
                            <h3 className="text-lg font-black text-gray-900 text-center uppercase tracking-wide">
                                {formType === 'CHECK_IN' ? 'Điểm danh vào ca' :
                                 formType === 'CHECK_OUT' ? 'Điểm danh tan ca' :
                                 'Điểm danh bổ sung'}
                            </h3>

                            {formType === 'CHECK_IN' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 block">Ca làm việc hôm nay</label>
                                    {activeShiftType ? (
                                        <select 
                                            value={selectedShiftType}
                                            disabled
                                            className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-gray-50 text-gray-500 font-medium cursor-not-allowed"
                                        >
                                            <option value={activeShiftType}>
                                                {activeShiftType === 'SHIFT_1' ? 'Ca 1 (09:00 - 17:00)' :
                                                 activeShiftType === 'SHIFT_2' ? 'Ca 2 (11:00 - 19:00)' :
                                                 activeShiftType === 'SHIFT_3' ? 'Ca 3 (17:00 - 00:00)' : 
                                                 activeShiftType === 'FREE' ? 'Ca tự do (Linh hoạt)' :
                                                 activeShiftType === 'REQUEST' ? 'Làm khách yêu cầu' : activeShiftType}
                                            </option>
                                        </select>
                                    ) : (
                                        <>
                                            {isOffToday && (
                                                <div className="bg-blue-50 text-blue-700 p-2.5 rounded-lg text-xs mb-2 font-medium flex items-center gap-2">
                                                    <AlertCircle size={14} className="shrink-0" />
                                                    <span>Hôm nay là ngày OFF của bạn.</span>
                                                </div>
                                            )}
                                            <select 
                                                value={selectedShiftType}
                                                onChange={(e) => setSelectedShiftType(e.target.value)}
                                                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-gray-700"
                                            >
                                                <option value="FREE">Ca tự do (Linh hoạt)</option>
                                                <option value="REQUEST">Làm khách yêu cầu</option>
                                            </select>
                                        </>
                                    )}
                                </div>
                            )}
                            
                            {/* Camera input (Multiple Photos) */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 flex justify-between items-center">
                                    <span>
                                        {formType === 'CHECK_OUT' ? t.checkOutPhotoOptional : t.photoRequired}
                                    </span>
                                    {photos.length > 0 && photos.length < MAX_PHOTOS && (
                                        <span className="text-xs text-emerald-600 font-medium">Tối đa {MAX_PHOTOS} ảnh</span>
                                    )}
                                </label>
                                
                                {photos.length > 0 && (
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        {photos.map((photo, index) => (
                                            <div key={index} className="relative w-full h-32 rounded-xl overflow-hidden bg-black/5 border border-gray-200">
                                                <img src={photo} className="w-full h-full object-cover" />
                                                <button 
                                                    onClick={() => setPhotos(prev => prev.filter((_, i) => i !== index))}
                                                    className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full shadow hover:bg-black/80 transition-colors"
                                                >
                                                    <XCircle size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {photos.length < MAX_PHOTOS && (
                                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 focus:ring-2 focus:ring-emerald-500 transition-all rounded-xl cursor-pointer">
                                        <Camera size={24} className="text-gray-400 mb-1" />
                                        <span className="text-sm font-medium text-gray-500">
                                            {photos.length === 0 ? t.openCamera : t.addPhoto(photos.length + 1, MAX_PHOTOS)}
                                        </span>
                                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleCapture} />
                                    </label>
                                )}
                            </div>

                            {/* Reason input -> Logic: show if LATE_CHECKIN or if isLate===true on CHECK_IN */}
                            {(formType === 'LATE_CHECKIN' || (formType === 'CHECK_IN' && isLate)) && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                    {formType === 'CHECK_IN' && isLate && (
                                        <div className="text-xs font-medium text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 mb-2">
                                            {t.lateWarning}
                                        </div>
                                    )}
                                    <label className="text-sm font-semibold text-gray-700 block text-left flex gap-1 items-center">
                                        {formType === 'LATE_CHECKIN' ? t.reasonRequiredGeneral : t.reasonRequired} 
                                        <span className="text-rose-500">(*)</span>
                                    </label>
                                    <textarea 
                                        value={reason} onChange={e => setReason(e.target.value)}
                                        className="w-full border border-gray-200 rounded-xl min-h-[80px] max-h-32 p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-y" 
                                        placeholder={t.reasonPlaceholder}
                                    />
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setIsFormOpen(false)} className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors">Hủy</button>
                                <button 
                                   onClick={handleSubmitForm}
                                   disabled={(formType !== 'CHECK_OUT' && photos.length === 0) || ((formType === 'LATE_CHECKIN' || (formType === 'CHECK_IN' && isLate)) && !reason.trim())}
                                   className="flex-1 py-3.5 bg-emerald-600 active:scale-95 transition-transform text-white rounded-xl font-bold disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2">
                                    <CheckCircle2 size={18} /> Gửi
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ERROR MODAL */}
                {errorMsg && (
                    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 duration-200 text-center relative">
                            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-2">
                                <ShieldAlert size={32} className="text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Lỗi Điểm Danh</h3>
                            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{errorMsg}</p>
                            <button 
                                onClick={clearError}
                                className="w-full mt-4 py-3.5 bg-gray-100 text-gray-800 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </AppLayout>
    );
};

export default KTVAttendancePage;
