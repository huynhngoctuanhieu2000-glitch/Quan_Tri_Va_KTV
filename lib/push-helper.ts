
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://wrb-noi-bo-dev.vercel.app';

interface PushPayload {
    title: string;
    message: string;
    url?: string;
    targetStaffIds?: string[];
    targetRoles?: string[];
}

export async function sendPushNotification(payload: PushPayload) {
    try {
        const response = await fetch(`${BASE_URL}/api/notifications/push`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-webhook-secret': process.env.WEBHOOK_SECRET || ''
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('📡 [Push Helper] Sent:', result);
        return result;
    } catch (error) {
        console.error('❌ [Push Helper] Error:', error);
        return { success: false, error };
    }
}
