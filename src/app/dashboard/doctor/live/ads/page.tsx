"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ImageIcon, Loader2, MonitorPlay, Pencil, Plus, RefreshCw, Upload } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import {
    getQueueSideAdStatus,
    getTodayDateInput,
    toDateInput,
    type LiveQueueSideAd,
    type QueueSideAdPosition,
    type QueueSideAdStatus,
    type QueueSideAdType,
} from "@/lib/liveQueueAds";

type ClinicOption = {
    clinic_id: number;
    clinic_name: string | null;
};

type LiveAdsResponse = {
    clinics: ClinicOption[];
    selectedClinicId: number | null;
    ads: LiveQueueSideAd[];
};

type FormState = {
    clinicId: string;
    type: QueueSideAdType;
    position: QueueSideAdPosition;
    title: string;
    sortOrder: string;
    isActive: boolean;
    activeFrom: string;
    activeTo: string;
    assetUrl: string;
    mimeType: string;
};

type ActivationDialogState = {
    adId: number;
    title: string;
    activeFrom: string;
    activeTo: string;
} | null;

const TODAY_DATE = getTodayDateInput();

const EMPTY_FORM: FormState = {
    clinicId: "",
    type: "LOGO",
    position: "LEFT",
    title: "",
    sortOrder: "0",
    isActive: true,
    activeFrom: TODAY_DATE,
    activeTo: TODAY_DATE,
    assetUrl: "",
    mimeType: "",
};

export default function DoctorLiveAdsPage() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [clinics, setClinics] = useState<ClinicOption[]>([]);
    const [selectedClinicId, setSelectedClinicId] = useState("");
    const [ads, setAds] = useState<LiveQueueSideAd[]>([]);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [editingAdId, setEditingAdId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [activationDialog, setActivationDialog] = useState<ActivationDialogState>(null);

    const groupedAds = useMemo(
        () => ({
            LEFT: ads.filter((ad) => ad.position === "LEFT"),
            RIGHT: ads.filter((ad) => ad.position === "RIGHT"),
        }),
        [ads]
    );

    const fetchAds = useCallback(async (clinicId?: string) => {
        setLoading(true);
        setMessage(null);

        try {
            const query = clinicId ? `?clinicId=${clinicId}` : "";
            const res = await fetch(`/api/doctors/live-ads${query}`, { cache: "no-store" });
            const data: LiveAdsResponse | { error?: string } = await res.json();

            if (!res.ok) {
                throw new Error("error" in data ? data.error || "Failed to load live ads." : "Failed to load live ads.");
            }

            const payload = data as LiveAdsResponse;
            setClinics(payload.clinics);
            setAds(payload.ads);

            const resolvedClinicId = payload.selectedClinicId ? String(payload.selectedClinicId) : "";
            setSelectedClinicId(resolvedClinicId);
            setForm((current) => ({
                ...current,
                clinicId: current.clinicId || resolvedClinicId,
            }));
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to load live ads.",
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAds();
    }, [fetchAds]);

    useEffect(() => {
        if (selectedClinicId) {
            setForm((current) => ({ ...current, clinicId: selectedClinicId }));
        }
    }, [selectedClinicId]);

    const resetForm = (clinicId = selectedClinicId) => {
        setEditingAdId(null);
        setForm({
            ...EMPTY_FORM,
            clinicId,
        });
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleClinicChange = async (value: string) => {
        setSelectedClinicId(value);
        resetForm(value);
        await fetchAds(value);
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

            const res = await fetch("/api/doctors/live-ads/upload", {
                method: "POST",
                body: payload,
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Upload failed.");
            }

            setForm((current) => ({
                ...current,
                assetUrl: data.url,
                mimeType: data.mimeType || file.type,
            }));
            setMessage({ type: "success", text: "Asset uploaded successfully." });
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Upload failed.",
            });
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!form.clinicId || !form.assetUrl) {
            setMessage({ type: "error", text: "Clinic and uploaded asset are required." });
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
                clinicId: Number(form.clinicId),
                type: form.type,
                position: form.position,
                title: form.title.trim() || null,
                sortOrder: Number(form.sortOrder) || 0,
                isActive: form.isActive,
                activeFrom: form.activeFrom,
                activeTo: form.activeTo,
                assetUrl: form.assetUrl,
                mimeType: form.mimeType || null,
            };

            const res = await fetch(
                editingAdId ? `/api/doctors/live-ads/${editingAdId}` : "/api/doctors/live-ads",
                {
                    method: editingAdId ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to save ad.");
            }

            setMessage({
                type: "success",
                text: editingAdId ? "Ad updated successfully." : "Ad created successfully.",
            });
            resetForm();
            await fetchAds(form.clinicId);
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to save ad.",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (ad: LiveQueueSideAd) => {
        setEditingAdId(ad.ad_id);
        setForm({
            clinicId: String(ad.clinic_id),
            type: ad.type,
            position: ad.position,
            title: ad.title || "",
            sortOrder: String(ad.sort_order),
            isActive: ad.is_active,
            activeFrom: toDateInput(ad.active_from) || TODAY_DATE,
            activeTo: toDateInput(ad.active_to) || TODAY_DATE,
            assetUrl: ad.asset_url,
            mimeType: ad.mime_type || "",
        });
        setMessage(null);
    };

    const handleDelete = async (adId: number) => {
        const confirmed = window.confirm("Delete this ad?");
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/doctors/live-ads/${adId}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to delete ad.");
            }

            setMessage({ type: "success", text: "Ad deleted successfully." });
            if (editingAdId === adId) {
                resetForm();
            }
            await fetchAds(selectedClinicId);
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to delete ad.",
            });
        }
    };

    const handleToggleActive = async (ad: LiveQueueSideAd) => {
        const status = getQueueSideAdStatus(ad);

        if (status === "INACTIVE" || status === "EXPIRED") {
            setActivationDialog({
                adId: ad.ad_id,
                title: ad.title || `${ad.position} ${ad.type.toLowerCase()} ad`,
                activeFrom: toDateInput(ad.active_from) || TODAY_DATE,
                activeTo: toDateInput(ad.active_to) || TODAY_DATE,
            });
            return;
        }

        try {
            const res = await fetch(`/api/doctors/live-ads/${ad.ad_id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: false }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to update ad status.");
            }

            setMessage({
                type: "success",
                text: "Ad deactivated.",
            });
            await fetchAds(selectedClinicId);
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to update ad status.",
            });
        }
    };

    const handleActivateWithDates = async () => {
        if (!activationDialog) {
            return;
        }

        if (!activationDialog.activeFrom || !activationDialog.activeTo) {
            setMessage({ type: "error", text: "Active from and active to dates are required." });
            return;
        }

        if (activationDialog.activeFrom > activationDialog.activeTo) {
            setMessage({ type: "error", text: "Active from date must be on or before active to date." });
            return;
        }

        try {
            const res = await fetch(`/api/doctors/live-ads/${activationDialog.adId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    isActive: true,
                    activeFrom: activationDialog.activeFrom,
                    activeTo: activationDialog.activeTo,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to activate ad.");
            }

            setActivationDialog(null);
            setMessage({ type: "success", text: "Ad activated with the selected date range." });
            await fetchAds(selectedClinicId);
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to activate ad.",
            });
        }
    };

    const getStatusTone = (status: QueueSideAdStatus) => {
        switch (status) {
            case "ACTIVE":
                return "bg-emerald-50 text-emerald-600";
            case "SCHEDULED":
                return "bg-amber-50 text-amber-600";
            case "EXPIRED":
                return "bg-rose-50 text-rose-600";
            default:
                return "bg-slate-100 text-slate-500";
        }
    };

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Live Queue Ads</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Manage left and right strip ads for the fullscreen Live Queue screen.
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                    <select
                        value={selectedClinicId}
                        onChange={(event) => void handleClinicChange(event.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none"
                    >
                        {clinics.length === 0 ? <option value="">No clinics found</option> : null}
                        {clinics.map((clinic) => (
                            <option key={clinic.clinic_id} value={clinic.clinic_id}>
                                {clinic.clinic_name || `Clinic ${clinic.clinic_id}`}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        onClick={() => void fetchAds(selectedClinicId)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-600"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {message ? (
                <div
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                        message.type === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-700"
                    }`}
                >
                    {message.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <GlassCard hoverEffect={false} className="space-y-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">
                                {editingAdId ? "Edit Ad" : "Add New Ad"}
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Multiple logos and multiple videos are allowed per side. Set an active date range for each ad.
                            </p>
                        </div>
                        {editingAdId ? (
                            <button
                                type="button"
                                onClick={() => resetForm()}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                            >
                                Cancel Edit
                            </button>
                        ) : null}
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Clinic</span>
                                <select
                                    value={form.clinicId}
                                    onChange={(event) => setForm((current) => ({ ...current, clinicId: event.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                                    required
                                >
                                    {clinics.map((clinic) => (
                                        <option key={clinic.clinic_id} value={clinic.clinic_id}>
                                            {clinic.clinic_name || `Clinic ${clinic.clinic_id}`}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Position</span>
                                <select
                                    value={form.position}
                                    onChange={(event) => setForm((current) => ({ ...current, position: event.target.value as QueueSideAdPosition }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                                >
                                    <option value="LEFT">Left Strip</option>
                                    <option value="RIGHT">Right Strip</option>
                                </select>
                            </label>

                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Ad Type</span>
                                <select
                                    value={form.type}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            type: event.target.value as QueueSideAdType,
                                            assetUrl: "",
                                            mimeType: "",
                                        }))
                                    }
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                                >
                                    <option value="LOGO">Logo</option>
                                    <option value="VIDEO">Video</option>
                                </select>
                            </label>

                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Sort Order</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.sortOrder}
                                    onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                                />
                            </label>

                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Active From</span>
                                <input
                                    type="date"
                                    value={form.activeFrom}
                                    onChange={(event) => setForm((current) => ({ ...current, activeFrom: event.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                                    required
                                />
                            </label>

                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Active To</span>
                                <input
                                    type="date"
                                    value={form.activeTo}
                                    onChange={(event) => setForm((current) => ({ ...current, activeTo: event.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                                    required
                                />
                            </label>
                        </div>

                        <label className="space-y-2 text-sm font-medium text-slate-700">
                            <span>Title</span>
                            <input
                                type="text"
                                value={form.title}
                                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                                placeholder="Internal label for this ad"
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                            />
                        </label>

                        <div className="space-y-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">Upload Asset</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {form.type === "VIDEO" ? "MP4 only, up to 50 MB." : "PNG, JPG, WEBP, SVG up to 10 MB."}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
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
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
                                    {form.type === "VIDEO" ? (
                                        <video
                                            src={form.assetUrl}
                                            className="h-56 w-full rounded-xl object-cover"
                                            muted
                                            loop
                                            playsInline
                                            autoPlay
                                        />
                                    ) : (
                                        <img
                                            src={form.assetUrl}
                                            alt={form.title || "Uploaded ad asset"}
                                            className="h-56 w-full rounded-xl object-contain"
                                        />
                                    )}
                                </div>
                            ) : null}
                        </div>

                        {!form.isActive ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                                This ad is currently saved as inactive. Save keeps it inactive; use the preview action to activate it with dates.
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                                type="submit"
                                disabled={saving || uploading}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingAdId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                {editingAdId ? "Update Ad" : "Create Ad"}
                            </button>

                            <button
                                type="button"
                                onClick={() => resetForm()}
                                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                            >
                                Reset Form
                            </button>
                        </div>
                    </form>
                </GlassCard>

                <div className="space-y-6">
                    {(["LEFT", "RIGHT"] as QueueSideAdPosition[]).map((side) => (
                        <GlassCard key={side} hoverEffect={false} className="space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-semibold text-slate-900">{side === "LEFT" ? "Left Strip Ads" : "Right Strip Ads"}</h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                        {side === "LEFT" ? "Displayed on the left side of the fullscreen Live Queue." : "Displayed on the right side of the fullscreen Live Queue."}
                                    </p>
                                </div>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {groupedAds[side].length} Item{groupedAds[side].length === 1 ? "" : "s"}
                                </span>
                            </div>

                            {loading ? (
                                <div className="flex items-center justify-center py-10 text-slate-500">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                </div>
                            ) : groupedAds[side].length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
                                    No ads configured for this side yet.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {groupedAds[side].map((ad) => (
                                        (() => {
                                            const status = getQueueSideAdStatus(ad);
                                            const canActivate = status === "INACTIVE" || status === "EXPIRED";

                                            return (
                                        <div
                                            key={ad.ad_id}
                                            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                        >
                                            <div className="grid gap-4 p-4 lg:grid-cols-[140px_minmax(0,1fr)]">
                                                <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                                                    {ad.type === "VIDEO" ? (
                                                        <video
                                                            src={ad.asset_url}
                                                            className="h-32 w-full object-cover"
                                                            muted
                                                            loop
                                                            playsInline
                                                            autoPlay
                                                        />
                                                    ) : (
                                                        <img
                                                            src={ad.asset_url}
                                                            alt={ad.title || "Ad preview"}
                                                            className="h-32 w-full object-contain p-3"
                                                        />
                                                    )}
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                        <div className="space-y-2">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
                                                                    {ad.type}
                                                                </span>
                                                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusTone(status)}`}>
                                                                    {status}
                                                                </span>
                                                            </div>
                                                            <h3 className="text-base font-semibold text-slate-900">
                                                                {ad.title || `${ad.position} ${ad.type.toLowerCase()} ad`}
                                                            </h3>
                                                            <p className="text-sm text-slate-500">
                                                                Sort order: {ad.sort_order}
                                                            </p>
                                                            <p className="text-sm text-slate-500">
                                                                Active window: {toDateInput(ad.active_from) || "Not set"} to {toDateInput(ad.active_to) || "Not set"}
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleActive(ad)}
                                                                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                                                            >
                                                                {canActivate ? "Activate" : "Deactivate"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEdit(ad)}
                                                                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleDelete(ad.ad_id)}
                                                                className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
                                                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                                                            <span className="font-semibold text-slate-700">Clinic</span>
                                                            <p className="mt-1">
                                                                {clinics.find((clinic) => clinic.clinic_id === ad.clinic_id)?.clinic_name || `Clinic ${ad.clinic_id}`}
                                                            </p>
                                                        </div>
                                                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                                                            <span className="font-semibold text-slate-700">Position</span>
                                                            <p className="mt-1">{ad.position}</p>
                                                        </div>
                                                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                                                            <span className="font-semibold text-slate-700">Preview Type</span>
                                                            <p className="mt-1">{ad.type === "VIDEO" ? "MP4 video" : "Logo / image"}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                            );
                                        })()
                                    ))}
                                </div>
                            )}
                        </GlassCard>
                    ))}

                    <GlassCard hoverEffect={false} className="space-y-3">
                        <h2 className="text-lg font-semibold text-slate-900">Display Rules</h2>
                        <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                            <div className="rounded-2xl bg-slate-50 p-4">
                                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
                                    <ImageIcon className="h-4 w-4 text-indigo-500" />
                                    Logos
                                </div>
                                <p>Multiple logos are allowed per side and will scroll in sort order.</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
                                    <MonitorPlay className="h-4 w-4 text-indigo-500" />
                                    Videos
                                </div>
                                <p>Multiple active videos are allowed per side and will play one after another in sort order.</p>
                            </div>
                        </div>
                    </GlassCard>
                </div>
            </div>

            {activationDialog ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
                    <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-[0_28px_70px_-30px_rgba(15,23,42,0.45)]">
                        <h2 className="text-xl font-semibold text-slate-900">Activate Ad</h2>
                        <p className="mt-2 text-sm text-slate-500">
                            Choose the active date range for <span className="font-semibold text-slate-700">{activationDialog.title}</span>.
                        </p>

                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Active From</span>
                                <input
                                    type="date"
                                    value={activationDialog.activeFrom}
                                    onChange={(event) =>
                                        setActivationDialog((current) =>
                                            current ? { ...current, activeFrom: event.target.value } : current
                                        )
                                    }
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                                />
                            </label>

                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Active To</span>
                                <input
                                    type="date"
                                    value={activationDialog.activeTo}
                                    onChange={(event) =>
                                        setActivationDialog((current) =>
                                            current ? { ...current, activeTo: event.target.value } : current
                                        )
                                    }
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                                />
                            </label>
                        </div>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setActivationDialog(null)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleActivateWithDates()}
                                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
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
