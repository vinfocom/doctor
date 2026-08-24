import { SmsServiceStatus } from "@/generated/prisma/enums";

type HospitalSmsConfigInput = {
    sms_service_enabled?: boolean | number | null;
    sms_credit_total?: number | bigint | null;
    sms_credit_used?: number | bigint | null;
    current_pack_total?: number | bigint | null;
    current_pack_used?: number | bigint | null;
    sms_service_status?: SmsServiceStatus | string | null;
};

export type HospitalSmsSnapshot = {
    enabled: boolean;
    status: SmsServiceStatus;
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    displayText: string;
};

function toNonNegativeNumber(value: number | bigint | null | undefined) {
    return Math.max(0, Number(value ?? 0));
}

export function deriveHospitalSmsSnapshot(input?: HospitalSmsConfigInput | null): HospitalSmsSnapshot {
    const enabled = Boolean(input?.sms_service_enabled);
    const lifetimeTotalCredits = toNonNegativeNumber(input?.sms_credit_total);
    const lifetimeUsedCredits = Math.min(lifetimeTotalCredits, toNonNegativeNumber(input?.sms_credit_used));
    const totalCredits = toNonNegativeNumber(input?.current_pack_total ?? lifetimeTotalCredits);
    const usedCredits = Math.min(totalCredits, toNonNegativeNumber(input?.current_pack_used ?? lifetimeUsedCredits));
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

export function toHospitalSmsPayload(input?: HospitalSmsConfigInput | null) {
    return deriveHospitalSmsSnapshot(input);
}
