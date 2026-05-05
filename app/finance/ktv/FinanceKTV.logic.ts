import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

export function useFinanceKTV() {
    const { user, hasPermission } = useAuth();
    const [withdrawals, setWithdrawals] = useState<any[]>([]);
    const [summaries, setSummaries] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const canAccessPage = hasPermission('finance_management');

    const fetchData = useCallback(async () => {
        try {
            // Lấy Withdrawals
            const res = await fetch('/api/finance/withdrawals?limit=50');
            const json = await res.json();
            if (json.success) setWithdrawals(json.data);

            // Lấy Summaries (Phase 3)
            const resSum = await fetch('/api/finance/ktv-summary');
            const jsonSum = await resSum.json();
            if (jsonSum.success) setSummaries(jsonSum.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleApprove = async (id: string, amount: number) => {
        if (!user) return alert('Bạn cần đăng nhập để thao tác');
        if (!confirm(`Xác nhận bạn ĐÃ GIAO ${amount.toLocaleString()}đ tiền mặt cho KTV này?`)) return;

        setIsProcessing(true);
        try {
            const res = await fetch(`/api/finance/withdrawals/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    status: 'APPROVED', 
                    adminId: user.id,
                    adminName: user.name || user.id
                })
            });
            const json = await res.json();
            if (json.success) {
                alert('Đã xác nhận giao tiền thành công!');
                fetchData(); // Refresh
            } else {
                alert('Lỗi: ' + json.error);
            }
        } catch (e) {
            alert('Lỗi hệ thống khi cập nhật');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async (id: string) => {
        if (!user) return alert('Bạn cần đăng nhập để thao tác');
        const note = prompt('Nhập lý do từ chối (bắt buộc):');
        if (!note) return;

        setIsProcessing(true);
        try {
            const res = await fetch(`/api/finance/withdrawals/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    status: 'REJECTED', 
                    note,
                    adminId: user.id,
                    adminName: user.name || user.id
                })
            });
            const json = await res.json();
            if (json.success) {
                alert('Đã từ chối yêu cầu rút tiền.');
                fetchData(); // Refresh
            } else {
                alert('Lỗi: ' + json.error);
            }
        } catch (e) {
            alert('Lỗi hệ thống khi cập nhật');
        } finally {
            setIsProcessing(false);
        }
    };

    return {
        user,
        canAccessPage,
        withdrawals,
        summaries,
        isLoading,
        isProcessing,
        handleApprove,
        handleReject,
        refresh: fetchData
    };
}
