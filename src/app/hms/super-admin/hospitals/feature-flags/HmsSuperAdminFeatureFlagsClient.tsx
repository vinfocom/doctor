"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { HmsLabelWithInfo } from "@/components/hms/HmsInfoHint";
import { HMS_FEATURE_FLAG_META } from "@/components/hms/hmsFeatureFlagMeta";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";
import type { HmsFeatureFlags } from "@/lib/hms-feature-flags";

type Hospital = {
    hospital_id: number;
    code: string;
    name: string;
    status: string;
};

const DEFAULT_FLAGS: HmsFeatureFlags = {
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

export default function HmsSuperAdminFeatureFlagsClient({ initialHospitalId }: { initialHospitalId?: number | null }) {
    const [hospitals, setHospitals] = useState<Hospital[]>([]);
    const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
    const [flags, setFlags] = useState<HmsFeatureFlags>(DEFAULT_FLAGS);
    const [originalFlags, setOriginalFlags] = useState<HmsFeatureFlags>(DEFAULT_FLAGS);
    const [loadingHospitals, setLoadingHospitals] = useState(true);
    const [loadingFlags, setLoadingFlags] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const clearError = useCallback(() => setError(""), []);
    const clearSuccess = useCallback(() => setSuccess(""), []);

    const selectedHospital = useMemo(
        () => hospitals.find((hospital) => hospital.hospital_id === selectedHospitalId) || null,
        [hospitals, selectedHospitalId]
    );
    const hasChanges = JSON.stringify(flags) !== JSON.stringify(originalFlags);

    useHmsAutoDismissMessage(error, clearError, 7500);
    useHmsAutoDismissMessage(success, clearSuccess, 5000);

    const loadHospitals = useCallback(async () => {
        setLoadingHospitals(true);
        setError("");

        try {
            const response = await fetch("/api/hms/super-admin/hospitals", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to load hospitals.");
                return;
            }

            const nextHospitals = Array.isArray(data.hospitals) ? data.hospitals : [];
            setHospitals(nextHospitals);
            setSelectedHospitalId((current) => {
                if (current) return current;
                if (initialHospitalId && nextHospitals.some((hospital: Hospital) => hospital.hospital_id === initialHospitalId)) {
                    return initialHospitalId;
                }
                return nextHospitals[0]?.hospital_id || null;
            });
        } catch {
            setError("Unable to load hospitals. Check your connection and try again.");
        } finally {
            setLoadingHospitals(false);
        }
    }, [initialHospitalId]);

    const loadFlags = useCallback(async (hospitalId: number) => {
        setLoadingFlags(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch(`/api/hms/super-admin/hospitals/${hospitalId}/feature-flags`, { cache: "no-store" });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to load feature flags.");
                return;
            }

            const nextFlags = { ...DEFAULT_FLAGS, ...(data.flags || {}) };
            setFlags(nextFlags);
            setOriginalFlags(nextFlags);
        } catch {
            setError("Unable to load feature flags. Check your connection and try again.");
        } finally {
            setLoadingFlags(false);
        }
    }, []);

    useEffect(() => {
        void loadHospitals();
    }, [loadHospitals]);

    useEffect(() => {
        if (selectedHospitalId) {
            void loadFlags(selectedHospitalId);
        }
    }, [loadFlags, selectedHospitalId]);

    const toggleFlag = (key: keyof HmsFeatureFlags) => {
        setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
        setSuccess("");
    };

    const saveFlags = async () => {
        if (!selectedHospitalId) {
            setError("Select a hospital before saving feature flags.");
            return;
        }

        setSaving(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch(`/api/hms/super-admin/hospitals/${selectedHospitalId}/feature-flags`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ flags }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to save feature flags.");
                return;
            }

            const nextFlags = { ...DEFAULT_FLAGS, ...(data.flags || {}) };
            setFlags(nextFlags);
            setOriginalFlags(nextFlags);
            setSuccess(`Feature flags saved for ${data.hospital?.code || selectedHospital?.code || "hospital"}.`);
        } catch {
            setError("Unable to save feature flags. Check your connection and try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="border-b border-gray-200 bg-white">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-white">
                            <ShieldCheck size={19} />
                        </span>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">HMS / Hospitals</p>
                            <h1 className="text-lg font-bold text-gray-950">Feature Flags</h1>
                        </div>
                    </div>
                    <Link
                        href="/hms/super-admin"
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        <ArrowLeft size={16} />
                        Hospitals
                    </Link>
                </div>
            </div>

            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {error && <HmsStatusAlert tone="error" message={error} onDismiss={clearError} />}
                {success && <HmsStatusAlert tone="success" message={success} onDismiss={clearSuccess} />}

                <div className="mb-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Hospital</label>
                        <select
                            value={selectedHospitalId || ""}
                            onChange={(event) => setSelectedHospitalId(Number(event.target.value) || null)}
                            disabled={loadingHospitals}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
                        >
                            {hospitals.length === 0 ? <option value="">No hospitals available</option> : null}
                            {hospitals.map((hospital) => (
                                <option key={hospital.hospital_id} value={hospital.hospital_id}>
                                    {hospital.code} - {hospital.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => selectedHospitalId ? void loadFlags(selectedHospitalId) : void loadHospitals()}
                            disabled={loadingHospitals || loadingFlags}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                            <RefreshCw size={15} className={loadingHospitals || loadingFlags ? "animate-spin" : ""} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={() => void saveFlags()}
                            disabled={saving || loadingFlags || !selectedHospitalId || !hasChanges}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                        >
                            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                            Save
                        </button>
                    </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 px-4 py-3">
                        <h2 className="text-sm font-semibold text-gray-950">
                            {selectedHospital ? `${selectedHospital.code} Feature Flags` : "Feature Flags"}
                        </h2>
                    </div>
                    {loadingHospitals || loadingFlags ? (
                        <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                            <Loader2 size={16} className="animate-spin" />
                            Loading feature flags
                        </div>
                    ) : !selectedHospital ? (
                        <div className="px-4 py-6 text-sm text-gray-500">Create a hospital before setting feature flags.</div>
                    ) : (
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
                                            <button
                                                type="button"
                                                onClick={() => toggleFlag(flag.key)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                    flags[flag.key] ? "bg-black" : "bg-gray-300"
                                                }`}
                                                aria-label={`Turn ${flag.label} ${flags[flag.key] ? "off" : "on"}`}
                                            >
                                                <span
                                                    className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                                                        flags[flag.key] ? "translate-x-5" : "translate-x-1"
                                                    }`}
                                                />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>
        </div>
    );
}
