import prisma from "@/lib/prisma";
import type { HospitalContext } from "@/lib/hms-auth";

export type HmsFeatureFlags = {
    reception_module: boolean;
    lab_module: boolean;
    pharmacy_module: boolean;
    billing_module: boolean;
    casualty_module: boolean;
    qr_temp_token_enabled: boolean;
    referral_followup_waivers: boolean;
    capacity_surcharge: boolean;
    custom_terminology: boolean;
    emr_module: boolean;
    shared_paper_print_mode: boolean;
    tv_display_module: boolean;
    ads_module: boolean;
};

export type HmsFeatureKey = keyof HmsFeatureFlags;

type FeatureFlagRow = {
    flags: unknown;
};

export const DEFAULT_HMS_FEATURE_FLAGS: HmsFeatureFlags = {
    reception_module: true,
    lab_module: false,
    pharmacy_module: false,
    billing_module: true,
    casualty_module: false,
    qr_temp_token_enabled: true,
    referral_followup_waivers: true,
    capacity_surcharge: true,
    custom_terminology: true,
    emr_module: true,
    shared_paper_print_mode: true,
    tv_display_module: true,
    ads_module: true,
};

function parseJsonObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value !== "string") return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

export function normalizeHmsFeatureFlags(value: unknown): HmsFeatureFlags {
    const raw = parseJsonObject(value);
    return Object.fromEntries(
        Object.entries(DEFAULT_HMS_FEATURE_FLAGS).map(([key, fallback]) => [
            key,
            typeof raw[key] === "boolean" ? raw[key] : fallback,
        ])
    ) as HmsFeatureFlags;
}

export async function getHmsFeatureFlags(hospitalId: number) {
    const rows = await prisma.$queryRawUnsafe<FeatureFlagRow[]>(
        `
        SELECT flags
        FROM hospital_feature_flags
        WHERE hospital_id = ?
        LIMIT 1
        `,
        hospitalId
    );

    return normalizeHmsFeatureFlags(rows[0]?.flags);
}

export async function isHmsFeatureEnabled(context: HospitalContext, feature: HmsFeatureKey) {
    const flags = await getHmsFeatureFlags(context.hospitalId);
    return flags[feature] === true;
}
