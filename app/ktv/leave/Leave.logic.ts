'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

/**
 * Custom hook for KTV Leave page logic.
 */
export const useKTVLeave = () => {
    const { hasPermission } = useAuth();
    const [reason, setReason] = useState('');
    const [date, setDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const canAccessPage = hasPermission('ktv_leave');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !reason) return;
        setIsSubmitting(true);
        setTimeout(() => {
            setIsSubmitting(false);
            alert('Đã gửi yêu cầu nghỉ phép thành công!');
            setReason('');
            setDate('');
        }, 1000);
    };

    return {
        reason,
        date,
        isSubmitting,
        mounted,
        canAccessPage,
        setReason,
        setDate,
        handleSubmit,
    };
};
