
// 🔧 BASE_URL: Use APP_URL (server-side) or NEXT_PUBLIC_BASE_URL or auto-detect
const getBaseUrl = () => {
    // Server-side: Use APP_URL env var (set in .env.local)
    if (process.env.APP_URL) return process.env.APP_URL;
    if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
    // Vercel auto-provides this env var
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    // Fallback for local dev
    return 'http://localhost:3001';
};

interface PushPayload {
    title: string;
    message: string;
    url?: string;
    targetStaffIds?: string[];
    targetRoles?: string[];
}

export async function sendPushNotification(payload: PushPayload) {
    const baseUrl = getBaseUrl();
    try {
        const response = await fetch(`${baseUrl}/api/notifications/push`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-webhook-secret': process.env.WEBHOOK_SECRET || ''
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('📡 [Push Helper] Sent to', baseUrl, ':', result);
        return result;
    } catch (error) {
        console.error('❌ [Push Helper] Error sending to', baseUrl, ':', error);
        return { success: false, error };
    }
}
