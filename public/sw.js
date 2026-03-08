/*
 * Service Worker for Ngân Hà Spa Management
 * Handles Web Push Notifications
 */

self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push Received.');
    let data = { title: 'Ngân Hà Spa', body: 'Bạn có thông báo mới!' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'Ngân Hà Spa', body: event.data.text() };
        }
    }

    const options = {
        body: data.body,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/'
        },
        actions: [
            { action: 'open', title: 'Xem chi tiết' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    console.log('[Service Worker] Notification click Received.');
    event.notification.close();

    const targetUrl = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // If a window is already open, focus it and navigate
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise, open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
