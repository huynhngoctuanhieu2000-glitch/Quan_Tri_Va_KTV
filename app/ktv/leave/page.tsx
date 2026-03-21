'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ShieldAlert, CalendarDays, Send } from 'lucide-react';
import { useKTVLeave } from './Leave.logic';
import { t } from './Leave.i18n';

export default function KTVLeavePage() {
    const {
        reason,
        date,
        isSubmitting,
        mounted,
        canAccessPage,
        setReason,
        setDate,
        handleSubmit,
    } = useKTVLeave();

    if (!mounted) return null;

    if (!canAccessPage) {
        return (
            <AppLayout title="Nghỉ Phép">
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <ShieldAlert size={48} className="text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">{t.noAccess}</h2>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Nghỉ Phép">
            <div className="max-w-md mx-auto space-y-6">
                <div>
                    <p className="text-sm text-gray-500">{t.pageSubtitle}</p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t.labelDate}</label>
                            <div className="relative">
                                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t.labelReason}</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder={t.placeholderReason}
                                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none h-24 text-sm"
                                required
                            />
                        </div>

                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
                            <strong>{t.warningPrefix}</strong> {t.warning}
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !date || !reason}
                            className="w-full py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                        >
                            <Send size={18} />
                            {isSubmitting ? t.submitting : t.submit}
                        </button>
                    </form>
                </div>
            </div>
        </AppLayout>
    );
}
