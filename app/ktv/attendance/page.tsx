'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    ShieldAlert, MapPin, Clock, CheckCircle2,
    ExternalLink, Loader2, XCircle, LogOut, LogIn
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

    return (
        <AppLayout title="Chấm Công">
            <div className="max-w-sm mx-auto px-4 py-8 space-y-6">
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
                            <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center">
                                <LogIn size={40} className="text-emerald-600" />
                            </div>
                            <div className="text-center">
                                <p className="font-semibold text-gray-800">{t.startShift}</p>
                                <p className="text-sm text-gray-400 mt-1">{t.gpsNote}</p>
                            </div>
                            <button
                                onClick={() => handleAttendance('CHECK_IN')}
                                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-lg rounded-2xl transition-all shadow-md shadow-emerald-200"
                            >
                                {t.checkIn}
                            </button>
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
                                {t.loadingGPS}
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
                                onClick={() => handleAttendance('CHECK_OUT')}
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
            </div>
        </AppLayout>
    );
};

export default KTVAttendancePage;
