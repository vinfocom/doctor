import { SmsServiceStatus } from "@/generated/prisma/enums";

type SmsConfigInput = {
    sms_service_enabled?: boolean | null;
    sms_credit_total?: number | null;
    sms_credit_used?: number | null;
    current_pack_total?: number | null;
    current_pack_used?: number | null;
    sms_service_status?: SmsServiceStatus | null;
};

export type DoctorSmsSnapshot = {
    enabled: boolean;
    status: SmsServiceStatus;
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    displayText: string;
};

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
