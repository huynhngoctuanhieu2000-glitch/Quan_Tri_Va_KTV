'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

/**
 * Custom hook quản lý logic cho trang Lịch sử KTV
 * Tách biệt hoàn toàn Business Logic khỏi UI.
 */
export const useKTVHistory = () => {
  const { hasPermission, user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      // 1. Fetch Bookings where technicianCode contains user.id
      const { data: bookings, error: bError } = await supabase
        .from('Bookings')
        .select('*')
        .ilike('technicianCode', `%${user.id}%`)
        .order('createdAt', { ascending: false })
        .limit(20);

      if (bError) {
        console.error('❌ [KTVHistory] Bookings query error:', bError.message);
        throw bError;
      }

      if (!bookings || bookings.length === 0) {
        setHistory([]);
        return;
      }

      // 2. Fetch BookingItems for these bookings
      const bookingIds = bookings.map(b => b.id);
      const { data: items, error: iError } = await supabase
        .from('BookingItems')
        .select('*')
        .in('bookingId', bookingIds);

      if (iError) {
        console.warn('⚠️ [KTVHistory] BookingItems query error:', iError.message);
        // We still show bookings even if items fail
        setHistory(bookings.map(b => ({ ...b, BookingItems: [] })));
      } else {
        // Attach items to bookings
        const combined = bookings.map(b => ({
          ...b,
          BookingItems: (items || []).filter(item => item.bookingId === b.id)
        }));
        setHistory(combined);
      }
    } catch (err: any) {
      console.error('Error fetching history:', err.message || err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
       fetchHistory();
    }
  }, [user?.id, fetchHistory]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS': return { label: 'Đang làm', color: 'text-indigo-600 bg-indigo-50' };
      case 'FEEDBACK': return { label: 'Chờ đánh giá', color: 'text-blue-600 bg-blue-50' };
      case 'DONE': return { label: 'Hoàn tất', color: 'text-emerald-600 bg-emerald-50' };
      default: return { label: status, color: 'text-gray-500 bg-gray-50' };
    }
  };

  return {
    user,
    hasPermission,
    history,
    isLoading,
    fetchHistory,
    getStatusLabel
  };
};
