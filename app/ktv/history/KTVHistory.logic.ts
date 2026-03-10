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
      // Fetch bookings where technicianCode contains user.id
      // technicianCode is comma separated string like "KTV001, KTV002"
      const { data, error } = await supabase
        .from('Bookings')
        .select(`
          *,
          BookingItems (
            serviceId,
            price,
            duration
          )
        `)
        .ilike('technicianCode', `%${user.id}%`)
        .order('createdAt', { ascending: false })
        .limit(20);

      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
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
