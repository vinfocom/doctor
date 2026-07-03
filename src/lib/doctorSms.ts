import { SmsServiceStatus } from "@/generated/prisma/enums";

type SmsConfigInput = {
    sms_service_enabled?: boolean | null;
    sms_credit_total?: number | null;
    sms_credit_used?: number | null;
    current_pack_total?: number | null;
    current_pack_used?: number | null;
    sms_service_status?: SmsServiceStatus | null;
    low_pack_alert_sent_at?: Date | string | null;
    exhausted_alert_sent_at?: Date | string | null;
};

export type DoctorSmsSnapshot = {
    enabled: boolean;
    status: SmsServiceStatus;
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    displayText: string;
};

export type DoctorSmsPackAlertType = "LOW_PACK" | "EXHAUSTED";

export function deriveDoctorSmsSnapshot(input?: SmsConfigInput | null): DoctorSmsSnapshot {
    const enabled = Boolean(input?.sms_service_enabled);
    const lifetimeTotalCredits = Math.max(0, Number(input?.sms_credit_total ?? 0));
    const lifetimeUsedCredits = Math.max(0, Math.min(lifetimeTotalCredits, Number(input?.sms_credit_used ?? 0)));
    const totalCredits = Math.max(0, Number(input?.current_pack_total ?? lifetimeTotalCredits));
    const usedCredits = Math.max(0, Math.min(totalCredits, Number(input?.current_pack_used ?? lifetimeUsedCredits)));
    const remainingCredits = Math.max(0, totalCredits - usedCredits);
    const status = !enabled
        ? SmsServiceStatus.DISABLED
        : remainingCredits > 0
            ? SmsServiceStatus.ACTIVE
            : SmsServiceStatus.EXHAUSTED;

    return {
        enabled,
        status,
        totalCredits,
        usedCredits,
        remainingCredits,
        displayText: `${remainingCredits}/${totalCredits} left`,
    };
}

export function toDoctorSmsPayload(input?: SmsConfigInput | null) {
    return deriveDoctorSmsSnapshot(input);
}

export function getDoctorSmsPackAlertType(input?: SmsConfigInput | null): DoctorSmsPackAlertType | null {
    const snapshot = deriveDoctorSmsSnapshot(input);

    if (snapshot.totalCredits <= 0 || !snapshot.enabled) {
        return null;
    }

    if (snapshot.remainingCredits <= 0) {
        return input?.exhausted_alert_sent_at ? null : "EXHAUSTED";
    }

    const usageRatio = snapshot.totalCredits > 0 ? snapshot.usedCredits / snapshot.totalCredits : 0;
    if (usageRatio >= 0.9) {
        return input?.low_pack_alert_sent_at ? null : "LOW_PACK";
    }

    return null;
}
