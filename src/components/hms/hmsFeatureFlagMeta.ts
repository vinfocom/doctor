import type { HmsFeatureFlags } from "@/lib/hms-feature-flags";

export const HMS_FEATURE_FLAG_META: Array<{ key: keyof HmsFeatureFlags; label: string; scope: string; info: string }> = [
    {
        key: "reception_module",
        label: "Reception",
        scope: "Registration desk, patients, and visits",
        info: "Turn this on for staff who register patients, search UHIDs, collect payment, and create visits.",
    },
    {
        key: "emr_module",
        label: "EMR",
        scope: "Hospital doctor prescription pad",
        info: "Turn this on when HMS doctors should write structured prescriptions from their visit screen.",
    },
    {
        key: "shared_paper_print_mode",
        label: "Print",
        scope: "Registration and prescription printing",
        info: "Turn this on when the hospital prints on shared or preprinted paper and needs each print to start in the correct place.",
    },
    {
        key: "tv_display_module",
        label: "TV Display",
        scope: "Waiting-area queue screen",
        info: "Turn this on to use the hospital TV queue screen that rotates between selected doctors.",
    },
    {
        key: "ads_module",
        label: "Ads",
        scope: "Hospital TV side ads",
        info: "Turn this on to show hospital-managed logo or video ads beside the TV queue.",
    },
    {
        key: "referral_followup_waivers",
        label: "Referral",
        scope: "Referral and follow-up fee rules",
        info: "Turn this on when referral or follow-up rules should allow free or waived visits.",
    },
    {
        key: "qr_temp_token_enabled",
        label: "QR Temp Token",
        scope: "Temporary patient token",
        info: "Turn this on when patients can start with a temporary token before final registration.",
    },
    {
        key: "capacity_surcharge",
        label: "Capacity Surcharge",
        scope: "Extra charge after daily limit",
        info: "Turn this on to add an extra charge when a doctor has crossed the daily patient limit.",
    },
    {
        key: "billing_module",
        label: "Billing",
        scope: "Payment and fee collection",
        info: "Turn this on when Reception should record fees, payment mode, paid status, and waived visits.",
    },
    {
        key: "lab_module",
        label: "Lab",
        scope: "Lab workflow",
        info: "Turn this on when lab-related visit status and lab workflow should be available.",
    },
    {
        key: "pharmacy_module",
        label: "Pharmacy",
        scope: "Pharmacy desk workflow",
        info: "Turn this on when a separate pharmacy desk workflow is available. This does not add a doctor visit status.",
    },
    {
        key: "casualty_module",
        label: "Casualty",
        scope: "Casualty registrations",
        info: "Turn this on when the hospital needs casualty visit numbering and casualty registrations.",
    },
    {
        key: "custom_terminology",
        label: "Custom Terminology",
        scope: "Hospital wording",
        info: "Turn this on when the hospital wants labels such as Registration or Visit to match its own wording.",
    },
];
