"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { HmsLabelWithInfo } from "@/components/hms/HmsInfoHint";
import { HMS_FEATURE_FLAG_META } from "@/components/hms/hmsFeatureFlagMeta";

type FeatureFlags = {
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

const DEFAULT_FLAGS: FeatureFlags = {
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

export default function HmsFeatureFlagsClient() {
    const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadFlags = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/hms/hospital-admin/feature-flags", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to load feature flags.");
                return;
            }

            setFlags({ ...DEFAULT_FLAGS, ...(data.flags || {}) });
        } catch {
            setError("Unable to load feature flags. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadFlags();
    }, [loadFlags]);

    return (
        <div className="w-full">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hospital Admin</p>
                    <h1 className="mt-1 text-2xl font-bold text-gray-950 sm:text-3xl">Enabled Features</h1>
                </div>
                <button
                    type="button"
                    onClick={() => void loadFlags()}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle size={17} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
                    <Loader2 size={16} className="animate-spin" />
                    Loading feature flags
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Feature</th>
                                <th className="px-4 py-3 font-semibold">Scope</th>
                                <th className="px-4 py-3 font-semibold">Enabled</th>
                            </tr>
                        </thead>
                        <tbody>
                            {HMS_FEATURE_FLAG_META.map((flag) => (
                                <tr key={flag.key} className="border-t border-gray-100">
                                    <td className="px-4 py-3 font-semibold text-gray-950">
                                        <HmsLabelWithInfo label={flag.label} info={flag.info} />
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{flag.scope}</td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                flags[flag.key] ? "bg-black" : "bg-gray-300"
                                            }`}
                                            aria-label={`${flag.label} is ${flags[flag.key] ? "enabled" : "disabled"}`}
                                        >
                                            <span
                                                className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                                                    flags[flag.key] ? "translate-x-5" : "translate-x-1"
                                                }`}
                                            />
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
