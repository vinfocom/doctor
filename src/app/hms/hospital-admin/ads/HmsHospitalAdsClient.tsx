"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Loader2, MonitorPlay, Pencil, Plus, RefreshCw, Upload } from "lucide-react";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import {
    getQueueSideAdStatus,
    getTodayDateInput,
    type QueueSideAdPosition,
    type QueueSideAdStatus,
    type QueueSideAdType,
} from "@/lib/liveQueueAds";

type HospitalAd = {
    ad_id: number;
    hospital_id: number;
    position: QueueSideAdPosition;
    type: QueueSideAdType;
    asset_url: string;
    storage_key: string | null;
    mime_type: string | null;
    original_filename: string | null;
    file_size_bytes: number | null;
    title: string | null;
    is_active: boolean;
    active_from: string | null;
    active_to: string | null;
    sort_order: number;
};

type FormState = {
    type: QueueSideAdType;
    position: QueueSideAdPosition;
    title: string;
    sortOrder: string;
    isActive: boolean;
    activeFrom: string;
    activeTo: string;
    assetUrl: string;
    storageKey: string;
    mimeType: string;
    originalFilename: string;
    fileSizeBytes: number | null;
};

type ActivationDialogState = {
    adId: number;
    title: string;
    activeFrom: string;
    activeTo: string;
} | null;

type TvSettingsState = {
    tv_rotation_seconds: string;
    tv_remaining_slide_seconds: string;
};

type ApiMessage = {
    type: "success" | "error";
    text: string;
} | null;

const TODAY_DATE = getTodayDateInput();
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

const EMPTY_FORM: FormState = {
    type: "LOGO",
    position: "LEFT",
    title: "",
    sortOrder: "0",
    isActive: true,
    activeFrom: TODAY_DATE,
    activeTo: TODAY_DATE,
    assetUrl: "",
    storageKey: "",
    mimeType: "",
    originalFilename: "",
    fileSizeBytes: null,
};

async function readApiJson<T>(response: Response): Promise<T | null> {
    const raw = await response.text();
    if (!raw) return null;

    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function formatSize(bytes: number | null) {
    if (!bytes) return "-";
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getStatusTone(status: QueueSideAdStatus) {
    switch (status) {
        case "ACTIVE":
            return "bg-emerald-50 text-emerald-700 border-emerald-200";
        case "SCHEDULED":
            return "bg-amber-50 text-amber-700 border-amber-200";
        case "EXPIRED":
            return "bg-rose-50 text-rose-700 border-rose-200";
        default:
            return "bg-white text-black border-black";
    }
}

function toDisplayAd(ad: HospitalAd) {
    return {
        ad_id: ad.ad_id,
        doctor_id: 0,
        clinic_id: ad.hospital_id,
        position: ad.position,
        type: ad.type,
        asset_url: ad.asset_url,
        mime_type: ad.mime_type,
        title: ad.title,
        is_active: ad.is_active,
        active_from: ad.active_from,
        active_to: ad.active_to,
        sort_order: ad.sort_order,
    };
}

export default function HmsHospitalAdsClient() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [ads, setAds] = useState<HospitalAd[]>([]);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [editingAdId, setEditingAdId] = useState<number | null>(null);
    const [activationDialog, setActivationDialog] = useState<ActivationDialogState>(null);
    const [tvSettings, setTvSettings] = useState<TvSettingsState>({
        tv_rotation_seconds: "40",
        tv_remaining_slide_seconds: "8",
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingTiming, setSavingTiming] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<ApiMessage>(null);

    useEffect(() => {
        if (!message) return;
        const timer = window.setTimeout(() => setMessage(null), message.type === "success" ? 5000 : 7500);
        return () => window.clearTimeout(timer);
    }, [message]);

    const groupedAds = useMemo(() => ({
        LEFT: ads.filter((ad) => ad.position === "LEFT"),
        RIGHT: ads.filter((ad) => ad.position === "RIGHT"),
    }), [ads]);

    const loadAds = useCallback(async () => {
        setLoading(true);
        setMessage(null);

        try {
            const res = await fetch("/api/hms/hospital-admin/ads", { cache: "no-store" });
            const data = await readApiJson<{ ads?: HospitalAd[]; tvSettings?: { tv_rotation_seconds?: number; tv_remaining_slide_seconds?: number }; error?: string }>(res);

            if (!res.ok) throw new Error(data?.error || GENERIC_ERROR_MESSAGE);

            setAds(Array.isArray(data?.ads) ? data.ads : []);
            setTvSettings({
                tv_rotation_seconds: String(data?.tvSettings?.tv_rotation_seconds ?? 40),
                tv_remaining_slide_seconds: String(data?.tvSettings?.tv_remaining_slide_seconds ?? 8),
            });
        } catch {
            setMessage({ type: "error", text: GENERIC_ERROR_MESSAGE });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadAds();
    }, [loadAds]);

    const resetForm = () => {
        setEditingAdId(null);
        setForm(EMPTY_FORM);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const updateForm = (patch: Partial<FormState>) => {
        setForm((current) => ({ ...current, ...patch }));
        setMessage(null);
    };

    const saveTvSettings = async () => {
        const rotationSeconds = Number(tvSettings.tv_rotation_seconds);
        const remainingSeconds = Number(tvSettings.tv_remaining_slide_seconds);
        if (!Number.isInteger(rotationSeconds) || rotationSeconds < 5 || !Number.isInteger(remainingSeconds) || remainingSeconds < 2) {
            setMessage({ type: "error", text: "Use at least 5 seconds for doctor rotation and 2 seconds for remaining slide." });
            return;
        }

        setSavingTiming(true);
        setMessage(null);

        try {
            const res = await fetch("/api/hms/hospital-admin/ads", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tv_rotation_seconds: rotationSeconds,
                    tv_remaining_slide_seconds: remainingSeconds,
                }),
            });
            const data = await readApiJson<{ tvSettings?: { tv_rotation_seconds?: number; tv_remaining_slide_seconds?: number }; error?: string }>(res);

            if (!res.ok) throw new Error(data?.error || GENERIC_ERROR_MESSAGE);

            setTvSettings({
                tv_rotation_seconds: String(data?.tvSettings?.tv_rotation_seconds ?? rotationSeconds),
                tv_remaining_slide_seconds: String(data?.tvSettings?.tv_remaining_slide_seconds ?? remainingSeconds),
            });
            setMessage({ type: "success", text: "TV timing saved." });
        } catch {
            setMessage({ type: "error", text: GENERIC_ERROR_MESSAGE });
        } finally {
            setSavingTiming(false);
        }
    };

    const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setMessage(null);

        try {
            const payload = new FormData();
            payload.append("file", file);
            payload.append("adType", form.type);

            const res = await fetch("/api/hms/hospital-admin/ads/upload", {
                method: "POST",
                body: payload,
            });
            const data = await readApiJson<{
                url?: string;
                storageKey?: string;
                mimeType?: string;
                originalFilename?: string;
                fileSizeBytes?: number;
                error?: string;
            }>(res);

            if (!res.ok || !data?.url) throw new Error(data?.error || "Something went wrong. Please try uploading again.");

            updateForm({
                assetUrl: data.url,
                storageKey: data.storageKey || "",
                mimeType: data.mimeType || file.type,
                originalFilename: data.originalFilename || file.name,
                fileSizeBytes: Number.isFinite(Number(data.fileSizeBytes)) ? Number(data.fileSizeBytes) : file.size,
            });
            setMessage({ type: "success", text: "Asset uploaded successfully." });
        } catch {
            setMessage({ type: "error", text: "Something went wrong. Please try uploading again." });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!form.assetUrl) {
            setMessage({ type: "error", text: "Uploaded asset is required." });
            return;
        }
        if (!form.activeFrom || !form.activeTo) {
            setMessage({ type: "error", text: "Active from and active to dates are required." });
            return;
        }
        if (form.activeFrom > form.activeTo) {
            setMessage({ type: "error", text: "Active from date must be on or before active to date." });
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const payload = {
                type: form.type,
                position: form.position,
                title: form.title.trim() || null,
                sortOrder: Number(form.sortOrder) || 0,
                isActive: form.isActive,
                activeFrom: form.activeFrom,
                activeTo: form.activeTo,
                assetUrl: form.assetUrl,
                storageKey: form.storageKey || null,
                mimeType: form.mimeType || null,
                originalFilename: form.originalFilename || null,
                fileSizeBytes: form.fileSizeBytes,
            };
            const res = await fetch(
                editingAdId ? `/api/hms/hospital-admin/ads/${editingAdId}` : "/api/hms/hospital-admin/ads",
                {
                    method: editingAdId ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );
            const data = await readApiJson<{ ad?: HospitalAd; error?: string }>(res);
            if (!res.ok || !data?.ad) throw new Error(data?.error || GENERIC_ERROR_MESSAGE);

            setMessage({ type: "success", text: editingAdId ? "Ad updated successfully." : "Ad created successfully." });
            resetForm();
            await loadAds();
        } catch {
            setMessage({ type: "error", text: GENERIC_ERROR_MESSAGE });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (ad: HospitalAd) => {
        setEditingAdId(ad.ad_id);
        setForm({
            type: ad.type,
            position: ad.position,
            title: ad.title || "",
            sortOrder: String(ad.sort_order),
            isActive: ad.is_active,
            activeFrom: ad.active_from || TODAY_DATE,
            activeTo: ad.active_to || TODAY_DATE,
            assetUrl: ad.asset_url,
            storageKey: ad.storage_key || "",
            mimeType: ad.mime_type || "",
            originalFilename: ad.original_filename || "",
            fileSizeBytes: ad.file_size_bytes,
        });
        setMessage(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const updateAd = async (adId: number, patch: Record<string, unknown>, successText: string) => {
        try {
            const res = await fetch(`/api/hms/hospital-admin/ads/${adId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const data = await readApiJson<{ ad?: HospitalAd; error?: string }>(res);
            if (!res.ok || !data?.ad) throw new Error(data?.error || GENERIC_ERROR_MESSAGE);
            setAds((current) => current.map((item) => item.ad_id === adId ? data.ad as HospitalAd : item));
            setMessage({ type: "success", text: successText });
        } catch {
            setMessage({ type: "error", text: GENERIC_ERROR_MESSAGE });
        }
    };

    const handleToggleActive = (ad: HospitalAd) => {
        const status = getQueueSideAdStatus(toDisplayAd(ad));
        if (status === "INACTIVE" || status === "EXPIRED") {
            setActivationDialog({
                adId: ad.ad_id,
                title: ad.title || `${ad.position} ${ad.type.toLowerCase()} ad`,
                activeFrom: ad.active_from || TODAY_DATE,
                activeTo: ad.active_to || TODAY_DATE,
            });
            return;
        }

        void updateAd(ad.ad_id, { isActive: false }, "Ad deactivated.");
    };

    const handleActivateWithDates = async () => {
        if (!activationDialog) return;
        if (!activationDialog.activeFrom || !activationDialog.activeTo) {
            setMessage({ type: "error", text: "Active from and active to dates are required." });
            return;
        }
        if (activationDialog.activeFrom > activationDialog.activeTo) {
            setMessage({ type: "error", text: "Active from date must be on or before active to date." });
            return;
        }

        await updateAd(
            activationDialog.adId,
            {
                isActive: true,
                activeFrom: activationDialog.activeFrom,
                activeTo: activationDialog.activeTo,
            },
            "Ad activated with the selected date range."
        );
        setActivationDialog(null);
    };

    const handleDelete = async (adId: number) => {
        if (!window.confirm("Delete this ad?")) return;

        try {
            const res = await fetch(`/api/hms/hospital-admin/ads/${adId}`, { method: "DELETE" });
            const data = await readApiJson<{ error?: string }>(res);
            if (!res.ok) throw new Error(data?.error || GENERIC_ERROR_MESSAGE);
            setAds((current) => current.filter((item) => item.ad_id !== adId));
            if (editingAdId === adId) resetForm();
            setMessage({ type: "success", text: "Ad deleted successfully." });
        } catch {
            setMessage({ type: "error", text: GENERIC_ERROR_MESSAGE });
        }
    };

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-black">Hospital Admin</p>
                    <h1 className="text-3xl font-bold text-black">Live TV Ads</h1>
                </div>
                <button
                    type="button"
                    onClick={() => void loadAds()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-black bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </button>
            </div>

            {message ? <HmsStatusAlert tone={message.type} message={message.text} onDismiss={() => setMessage(null)} className="mb-0" /> : null}

            <section className="rounded-2xl border border-black bg-white p-4">
                <div className="mb-4 flex items-center gap-2">
                    <MonitorPlay className="h-5 w-5 text-black" />
                    <h2 className="text-lg font-semibold text-black">TV Display Timing</h2>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                    <label className="space-y-2 text-sm font-medium text-black">
                        <span>Doctor screen rotation seconds</span>
                        <input
                            type="number"
                            min="5"
                            max="300"
                            value={tvSettings.tv_rotation_seconds}
                            onChange={(event) => setTvSettings((current) => ({ ...current, tv_rotation_seconds: event.target.value }))}
                            className="w-full rounded-xl border border-black bg-white px-3 py-2.5 text-sm text-black outline-none"
                        />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-black">
                        <span>Remaining list slide seconds</span>
                        <input
                            type="number"
                            min="2"
                            max="300"
                            value={tvSettings.tv_remaining_slide_seconds}
                            onChange={(event) => setTvSettings((current) => ({ ...current, tv_remaining_slide_seconds: event.target.value }))}
                            className="w-full rounded-xl border border-black bg-white px-3 py-2.5 text-sm text-black outline-none"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => void saveTvSettings()}
                        disabled={savingTiming}
                        className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {savingTiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorPlay className="h-4 w-4" />}
                        {savingTiming ? "Saving..." : "Save TV Timing"}
                    </button>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <section className="space-y-5 rounded-2xl border border-black bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-black">{editingAdId ? "Edit Ad" : "Add New Ad"}</h2>
                            <p className="mt-1 text-sm text-black">Multiple logos and videos are allowed per side. Active items play on the TV strip.</p>
                        </div>
                        {editingAdId ? (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="rounded-xl border border-black px-3 py-2 text-sm font-medium text-black transition hover:bg-black hover:text-white"
                            >
                                Cancel Edit
                            </button>
                        ) : null}
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2 text-sm font-medium text-black">
                                <span>Position</span>
                                <select
                                    value={form.position}
                                    onChange={(event) => updateForm({ position: event.target.value as QueueSideAdPosition })}
                                    className="w-full rounded-xl border border-black bg-white px-4 py-3 text-sm text-black outline-none"
                                >
                                    <option value="LEFT">Left Strip</option>
                                    <option value="RIGHT">Right Strip</option>
                                </select>
                            </label>

                            <label className="space-y-2 text-sm font-medium text-black">
                                <span>Ad Type</span>
                                <select
                                    value={form.type}
                                    onChange={(event) => updateForm({
                                        type: event.target.value as QueueSideAdType,
                                        assetUrl: "",
                                        storageKey: "",
                                        mimeType: "",
                                        originalFilename: "",
                                        fileSizeBytes: null,
                                    })}
                                    className="w-full rounded-xl border border-black bg-white px-4 py-3 text-sm text-black outline-none"
                                >
                                    <option value="LOGO">Logo</option>
                                    <option value="VIDEO">Video</option>
                                </select>
                            </label>

                            <label className="space-y-2 text-sm font-medium text-black">
                                <span>Sort Order</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.sortOrder}
                                    onChange={(event) => updateForm({ sortOrder: event.target.value })}
                                    className="w-full rounded-xl border border-black bg-white px-4 py-3 text-sm text-black outline-none"
                                />
                            </label>

                            <label className="space-y-2 text-sm font-medium text-black">
                                <span>Title</span>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={(event) => updateForm({ title: event.target.value })}
                                    className="w-full rounded-xl border border-black bg-white px-4 py-3 text-sm text-black outline-none"
                                />
                            </label>

                            <label className="space-y-2 text-sm font-medium text-black">
                                <span>Active From</span>
                                <input
                                    type="date"
                                    value={form.activeFrom}
                                    onChange={(event) => updateForm({ activeFrom: event.target.value })}
                                    className="w-full rounded-xl border border-black bg-white px-4 py-3 text-sm text-black outline-none"
                                    required
                                />
                            </label>

                            <label className="space-y-2 text-sm font-medium text-black">
                                <span>Active To</span>
                                <input
                                    type="date"
                                    value={form.activeTo}
                                    onChange={(event) => updateForm({ activeTo: event.target.value })}
                                    className="w-full rounded-xl border border-black bg-white px-4 py-3 text-sm text-black outline-none"
                                    required
                                />
                            </label>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-dashed border-black bg-white p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-black">Upload Asset</p>
                                    <p className="mt-1 text-xs text-black">
                                        {form.type === "VIDEO" ? "MP4 only, up to 50 MB." : "PNG, JPG, WEBP, SVG up to 10 MB."}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={uploading}
                                >
                                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    {uploading ? "Uploading..." : form.assetUrl ? "Replace File" : "Upload File"}
                                </button>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={form.type === "VIDEO" ? "video/mp4" : "image/png,image/jpeg,image/webp,image/svg+xml"}
                                className="hidden"
                                onChange={handleUpload}
                            />

                            {form.assetUrl ? (
                                <div className="overflow-hidden rounded-2xl border border-black bg-white p-3">
                                    {form.type === "VIDEO" ? (
                                        <video src={form.assetUrl} className="h-56 w-full rounded-xl object-cover" muted loop playsInline autoPlay />
                                    ) : (
                                        <img src={form.assetUrl} alt={form.title || "Uploaded ad asset"} className="h-56 w-full rounded-xl object-contain" />
                                    )}
                                    <p className="mt-2 truncate text-xs font-medium text-black">{form.originalFilename || "Uploaded asset"} · {formatSize(form.fileSizeBytes)}</p>
                                </div>
                            ) : null}
                        </div>

                        {!form.isActive ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                                This ad is saved as inactive. Use Activate on the strip card to set dates and show it again.
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                                type="submit"
                                disabled={saving || uploading}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingAdId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                {editingAdId ? "Update Ad" : "Create Ad"}
                            </button>
                            <button
                                type="button"
                                onClick={resetForm}
                                className="inline-flex items-center justify-center rounded-xl border border-black px-5 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
                            >
                                Reset Form
                            </button>
                        </div>
                    </form>
                </section>

                <div className="space-y-6">
                    {(["LEFT", "RIGHT"] as QueueSideAdPosition[]).map((side) => (
                        <section key={side} className="space-y-4 rounded-2xl border border-black bg-white p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-semibold text-black">{side === "LEFT" ? "Left Strip Ads" : "Right Strip Ads"}</h2>
                                    <p className="mt-1 text-sm text-black">
                                        {side === "LEFT" ? "Displayed on the left side of fullscreen Live TV." : "Displayed on the right side of fullscreen Live TV."}
                                    </p>
                                </div>
                                <span className="rounded-full border border-black px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-black">
                                    {groupedAds[side].length} Item{groupedAds[side].length === 1 ? "" : "s"}
                                </span>
                            </div>

                            {loading ? (
                                <div className="flex items-center justify-center py-10 text-black">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                </div>
                            ) : groupedAds[side].length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-black bg-white px-4 py-8 text-center text-sm text-black">
                                    No ads configured for this side yet.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {groupedAds[side].map((ad) => {
                                        const status = getQueueSideAdStatus(toDisplayAd(ad));
                                        const canActivate = status === "INACTIVE" || status === "EXPIRED";

                                        return (
                                            <div key={ad.ad_id} className="overflow-hidden rounded-2xl border border-black bg-white">
                                                <div className="grid gap-4 p-4 lg:grid-cols-[140px_minmax(0,1fr)]">
                                                    <div className="overflow-hidden rounded-xl border border-black bg-white">
                                                        {ad.type === "VIDEO" ? (
                                                            <video src={ad.asset_url} className="h-32 w-full object-cover" muted loop playsInline autoPlay />
                                                        ) : (
                                                            <img src={ad.asset_url} alt={ad.title || "Ad preview"} className="h-32 w-full object-contain p-3" />
                                                        )}
                                                    </div>

                                                    <div className="space-y-3">
                                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                            <div className="space-y-2">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="rounded-full border border-black px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-black">
                                                                        {ad.type}
                                                                    </span>
                                                                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusTone(status)}`}>
                                                                        {status}
                                                                    </span>
                                                                </div>
                                                                <h3 className="text-base font-semibold text-black">
                                                                    {ad.title || `${ad.position} ${ad.type.toLowerCase()} ad`}
                                                                </h3>
                                                                <p className="text-sm text-black">Sort order: {ad.sort_order}</p>
                                                                <p className="text-sm text-black">Active window: {ad.active_from || "Not set"} to {ad.active_to || "Not set"}</p>
                                                            </div>

                                                            <div className="flex flex-wrap gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleActive(ad)}
                                                                    className="rounded-xl border border-black px-3 py-2 text-xs font-semibold text-black transition hover:bg-black hover:text-white"
                                                                >
                                                                    {canActivate ? "Activate" : "Deactivate"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleEdit(ad)}
                                                                    className="rounded-xl border border-black px-3 py-2 text-xs font-semibold text-black transition hover:bg-black hover:text-white"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleDelete(ad.ad_id)}
                                                                    className="rounded-xl border border-red-600 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    ))}

                    <section className="space-y-3 rounded-2xl border border-black bg-white p-5">
                        <h2 className="text-lg font-semibold text-black">Display Rules</h2>
                        <div className="grid gap-3 text-sm text-black sm:grid-cols-2">
                            <div className="rounded-2xl border border-black bg-white p-4">
                                <div className="mb-2 flex items-center gap-2 font-semibold text-black">
                                    <ImageIcon className="h-4 w-4" />
                                    Logos
                                </div>
                                <p>Multiple logos are allowed per side and scroll in sort order.</p>
                            </div>
                            <div className="rounded-2xl border border-black bg-white p-4">
                                <div className="mb-2 flex items-center gap-2 font-semibold text-black">
                                    <MonitorPlay className="h-4 w-4" />
                                    Videos
                                </div>
                                <p>Multiple active videos are allowed per side and play one after another in sort order.</p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {activationDialog ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <h2 className="text-xl font-semibold text-black">Activate Ad</h2>
                        <p className="mt-1 text-sm text-black">{activationDialog.title}</p>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="space-y-2 text-sm font-medium text-black">
                                <span>Active From</span>
                                <input
                                    type="date"
                                    value={activationDialog.activeFrom}
                                    onChange={(event) => setActivationDialog((current) => current ? { ...current, activeFrom: event.target.value } : current)}
                                    className="w-full rounded-xl border border-black px-3 py-2 text-black outline-none"
                                />
                            </label>
                            <label className="space-y-2 text-sm font-medium text-black">
                                <span>Active To</span>
                                <input
                                    type="date"
                                    value={activationDialog.activeTo}
                                    onChange={(event) => setActivationDialog((current) => current ? { ...current, activeTo: event.target.value } : current)}
                                    className="w-full rounded-xl border border-black px-3 py-2 text-black outline-none"
                                />
                            </label>
                        </div>
                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setActivationDialog(null)}
                                className="rounded-xl border border-black px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleActivateWithDates()}
                                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                            >
                                Activate
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
