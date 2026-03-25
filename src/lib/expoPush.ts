/**
 * Utility to send push notifications using the Expo Push API.
 * The Expo Push API is a simple REST API that accepts HTTP POST requests.
 * See: https://docs.expo.dev/push-notifications/sending-notifications/
 */

interface ExpoPushMessage {
    to: string | string[];
    data?: Record<string, any>;
    title?: string;
    body?: string;
    sound?: 'default' | null;
    badge?: number;
}

export async function sendExpoPushNotification(message: ExpoPushMessage) {
    try {
        console.log('[expo-push] sending message', {
            to: message.to,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: message.sound,
            badge: message.badge,
        });

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        if (!response.ok) {
            console.error('[expo-push] failed to send Expo push notification:', await response.text());
            return null;
        }

        const data = await response.json();
        console.log('[expo-push] successfully sent Expo push notification:', data);
        return data;
    } catch (error) {
        console.error('[expo-push] error sending Expo push notification:', error);
        return null;
    }
}
