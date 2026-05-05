'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

export const useKTVWallet = () => {
    const { user, hasPermission } = useAuth();
    const canViewWallet = hasPermission('ktv_wallet');
    const ktvId = user?.id || '';

    const [walletBalance, setWalletBalance] = useState<any>(null);
    const [walletTimeline, setWalletTimeline] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchWallet = useCallback(async () => {
        if (!ktvId) return;
        setIsLoading(true);
        try {
            const [balanceRes, timelineRes] = await Promise.all([
                fetch(`/api/ktv/wallet/balance?techCode=${ktvId}`).then(r => r.json()),
                fetch(`/api/ktv/wallet/timeline?techCode=${ktvId}`).then(r => r.json())
            ]);

            if (balanceRes.success) setWalletBalance(balanceRes.data);
            if (timelineRes.success) setWalletTimeline(timelineRes.data);
        } catch (err) {
            console.error('Lỗi khi tải dữ liệu ví:', err);
        } finally {
            setIsLoading(false);
        }
    }, [ktvId]);

    useEffect(() => {
        if (ktvId && canViewWallet) {
            fetchWallet();
        }
    }, [ktvId, canViewWallet, fetchWallet]);

    const handleWithdraw = async () => {
        if (!walletBalance) return;
        const maxWithdraw = Number(walletBalance.effective_balance) - Number(walletBalance.min_deposit);
        if (maxWithdraw <= 0) {
            alert('Số dư khả dụng của bạn chưa đạt mức tối thiểu để rút.');
            return;
        }
        const amountStr = prompt(`Nhập số tiền muốn rút (Tối đa: ${maxWithdraw.toLocaleString()}đ):`);
        if (amountStr) {
            const amount = Number(amountStr.replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0) {
                if (amount > maxWithdraw) {
                    alert('Số tiền vượt quá mức khả dụng!');
                    return;
                }
                try {
                    const res = await fetch('/api/ktv/wallet/withdraw', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ techCode: ktvId, amount })
                    });
                    const json = await res.json();
                    if (json.success) {
                        alert('✅ Yêu cầu rút tiền của bạn đã được duyệt.\nHãy đến quầy Lễ tân/Thu ngân để nhận tiền mặt nhé!');
                        fetchWallet();
                    } else {
                        alert('Lỗi: ' + json.error);
                    }
                } catch (e) {
                    alert('Lỗi hệ thống khi tạo lệnh rút tiền.');
                }
            } else {
                alert('Số tiền không hợp lệ.');
            }
        }
    };

    return {
        user,
        canViewWallet,
        walletBalance,
        walletTimeline,
        isLoading,
        handleWithdraw,
        refresh: fetchWallet
    };
};
