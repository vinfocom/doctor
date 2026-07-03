/**
 * Utility to send push notifications using the Expo Push API.
 * The Expo Push API is a simple REST API that accepts HTTP POST requests.
 * See: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_CHUNK_SIZE = 100;
const EXPO_PUSH_TOKEN_REGEX = /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/;

export interface ExpoPushMessage {
    to: string | string[];
    data?: Record<string, unknown>;
    title?: string;
    body?: string;
    sound?: "default" | null;
    badge?: number;
    channelId?: string;
    priority?: "default" | "normal" | "high";
    ttl?: number;
}

interface ExpoPushTicket {
    status?: "ok" | "error";
    id?: string;
    message?: string;
    details?: Record<string, unknown>;
}

interface ExpoPushResponse {
    data?: ExpoPushTicket | ExpoPushTicket[];
    errors?: Array<Record<string, unknown>>;
}

export interface SendChatPushNotificationInput {
    tokens: string[];
    patientId: number;
    doctorId: number;
    senderRole: "DOCTOR" | "PATIENT";
    senderName: string;
    body: string;
}

export interface SendDoctorSmsPackPushNotificationInput {
    tokens: string[];
    doctorId: number;
    doctorName: string;
    alertType: "LOW_PACK" | "EXHAUSTED";
    remainingCredits: number;
    totalCredits: number;
}

export function isExpoPushToken(value: string | null | undefined) {
    return Boolean(value && EXPO_PUSH_TOKEN_REGEX.test(String(value).trim()));
}

function chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function normalizeTokens(to: string | string[]) {
    return Array.from(
        new Set((Array.isArray(to) ? to : [to]).map((token) => String(token).trim()).filter(Boolean))
    );
}

function logExpoPushErrors(responseData: ExpoPushResponse, context: Record<string, unknown>) {
    const tickets = Array.isArray(responseData?.data) ? responseData.data : responseData?.data ? [responseData.data] : [];

    tickets.forEach((ticket, index) => {
        if (ticket?.status === "error") {
            console.error("[expo-push] ticket error", {
                ...context,
                index,
                message: ticket.message,
                details: ticket.details,
            });
        }
    });

    if (Array.isArray(responseData?.errors) && responseData.errors.length > 0) {
        console.error("[expo-push] response errors", {
            ...context,
            errors: responseData.errors,
        });
    }
}

export async function sendExpoPushNotification(message: ExpoPushMessage) {
    try {
        const tokens = normalizeTokens(message.to);
        const validTokens = tokens.filter((token) => isExpoPushToken(token));
        const invalidTokens = tokens.filter((token) => !isExpoPushToken(token));

        if (invalidTokens.length > 0) {
            console.warn("[expo-push] skipped invalid tokens", {
                invalidTokens,
                title: message.title,
            });
        }

        if (validTokens.length === 0) {
            console.warn("[expo-push] no valid Expo push tokens available", {
                title: message.title,
                originalTokenCount: tokens.length,
            });
            return [];
        }

        const payloadBase = {
            ...message,
            priority: message.priority ?? "high",
            channelId: message.channelId ?? "default",
            ttl: message.ttl ?? 60 * 60,
        };

        const responses: ExpoPushResponse[] = [];
        const tokenChunks = chunkArray(validTokens, EXPO_PUSH_CHUNK_SIZE);

        for (const chunk of tokenChunks) {
            const payload: ExpoPushMessage = {
                ...payloadBase,
                to: chunk,
            };

            console.log("[expo-push] sending chunk", {
                tokenCount: chunk.length,
                title: payload.title,
                body: payload.body,
                data: payload.data,
                channelId: payload.channelId,
                priority: payload.priority,
                ttl: payload.ttl,
            });

            const response = await fetch(EXPO_PUSH_ENDPOINT, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Accept-encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                console.error("[expo-push] failed to send chunk", {
                    status: response.status,
                    statusText: response.statusText,
                    responseText: await response.text(),
                    tokenCount: chunk.length,
                });
                continue;
            }

            const responseData = (await response.json()) as ExpoPushResponse;
            logExpoPushErrors(responseData, {
                title: payload.title,
                tokenCount: chunk.length,
            });

            console.log("[expo-push] successfully sent chunk", {
                tokenCount: chunk.length,
                responseData,
            });

            responses.push(responseData);
        }

        return responses;
    } catch (error) {
        console.error("[expo-push] error sending Expo push notification:", error);
        return [];
    }
}

export async function sendChatPushNotification(input: SendChatPushNotificationInput) {
    return sendExpoPushNotification({
        to: input.tokens,
        title: `New message from ${input.senderName}`,
        body: input.body,
        data: {
            type: "chat",
            patientId: input.patientId,
            doctorId: input.doctorId,
            senderRole: input.senderRole,
            senderName: input.senderName,
        },
        sound: "default",
        channelId: "default",
        priority: "high",
    });
}

export async function sendDoctorSmsPackPushNotification(input: SendDoctorSmsPackPushNotificationInput) {
    const isExhausted = input.alertType === "EXHAUSTED";
    const title = isExhausted ? "SMS pack exhausted" : "SMS pack running low";
    const body = isExhausted
        ? "Your SMS pack is exhausted. Please recharge to continue SMS service."
        : `${input.remainingCredits}/${input.totalCredits} SMS credits are left in your current pack. Please recharge soon.`;

    return sendExpoPushNotification({
        to: input.tokens,
        title,
        body,
        data: {
            type: "sms_pack",
            doctorId: input.doctorId,
            doctorName: input.doctorName,
            alertType: input.alertType,
            remainingCredits: input.remainingCredits,
            totalCredits: input.totalCredits,
        },
        sound: "default",
        channelId: "default",
        priority: "high",
    });
}
