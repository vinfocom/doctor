"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Copy, LayoutDashboard, Loader2, MessageSquare, Plus, Power, PowerOff, RefreshCw, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

type SmsService = {
    enabled: boolean;
    status: "DISABLED" | "ACTIVE" | "EXHAUSTED";
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    displayText: string;
};

type Hospital = {
    hospital_id: number;
    code: string;
    name: string;
    admin_id: number;
    status: string;
    created_at: string | null;
    updated_at: string | null;
    admin_user: {
        user_id: number;
        name: string | null;
        email: string | null;
    } | null;
    config: {
        policy_configured: boolean;
        feature_configured: boolean;
    };
    counts: {
        doctors: number;
        staff: number;
        visits: number;
    };
    sms_service: SmsService;
};

type Totals = {
    hospitals: number;
    active: number;
    inactive: number;
    admins: number;
};

type FormState = {
    code: string;
    name: string;
    status: "ACTIVE" | "INACTIVE";
    admin_name: string;
    admin_email: string;
};

type ConfirmAction =
    | { type: "TOGGLE"; hospital: Hospital }
    | { type: "DELETE"; hospital: Hospital };

const emptyForm: FormState = {
    code: "",
    name: "",
    status: "ACTIVE",
    admin_name: "",
    admin_email: "",
};

function validateForm(form: FormState) {
    const errors: Partial<Record<keyof FormState, string>> = {};
    const code = form.code.trim().toUpperCase();

    if (!code) errors.code = "Hospital code is required.";
    else if (!/^[A-Z0-9_-]{2,50}$/.test(code)) errors.code = "Use 2-50 letters, numbers, underscore, or hyphen.";
    if (!form.name.trim()) errors.name = "Hospital name is required.";
    if (!form.admin_name.trim()) errors.admin_name = "Admin name is required.";
    if (!form.admin_email.trim()) errors.admin_email = "Admin email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_email.trim())) errors.admin_email = "Enter a valid email.";

    return errors;
}

export default function HmsSuperAdminClient() {
    const [hospitals, setHospitals] = useState<Hospital[]>([]);
    const [totals, setTotals] = useState<Totals>({ hospitals: 0, active: 0, inactive: 0, admins: 0 });
    const [form, setForm] = useState<FormState>(emptyForm);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [busyHospitalId, setBusyHospitalId] = useState<number | null>(null);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [smsHospital, setSmsHospital] = useState<Hospital | null>(null);
    const [smsEnabled, setSmsEnabled] = useState(false);
    const [smsRechargeCredits, setSmsRechargeCredits] = useState("");
    const [smsRechargeRemarks, setSmsRechargeRemarks] = useState("");
    const [smsSaving, setSmsSaving] = useState(false);
    const [temporaryPassword, setTemporaryPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const clearError = useCallback(() => setError(""), []);
    const clearSuccess = useCallback(() => setSuccess(""), []);

    useHmsAutoDismissMessage(error, clearError, 7500);
    useHmsAutoDismissMessage(success, clearSuccess, 5000);

    const sortedHospitals = useMemo(() => hospitals, [hospitals]);

    const loadHospitals = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/hms/super-admin/hospitals", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to load hospitals.");
                return;
            }

            setHospitals(Array.isArray(data.hospitals) ? data.hospitals : []);
            setTotals(data.totals || { hospitals: 0, active: 0, inactive: 0, admins: 0 });
        } catch {
            setError("Unable to load hospitals. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadHospitals();
    }, [loadHospitals]);

    const updateField = (field: keyof FormState, value: string) => {
        setForm((prev) => ({
            ...prev,
            [field]: field === "code" ? value.toUpperCase().replace(/\s+/g, "") : value,
        }));
        setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
        setSuccess("");
    };

    const createHospital = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        setTemporaryPassword("");

        const nextErrors = validateForm(form);
        setFieldErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            setError("Please correct the highlighted fields.");
            return;
        }

        setCreating(true);
        try {
            const response = await fetch("/api/hms/super-admin/hospitals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: form.code.trim(),
                    name: form.name.trim(),
                    status: form.status,
                    admin_name: form.admin_name.trim(),
                    admin_email: form.admin_email.trim(),
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to create hospital.");
                setFieldErrors(data.fieldErrors || {});
                return;
            }

            setForm(emptyForm);
            setFieldErrors({});
            setTemporaryPassword(data.temporaryPassword || "");
            setSuccess(`Hospital ${data.hospital?.code || ""} created. Copy the admin temporary password now.`);
            await loadHospitals();
        } catch {
            setError("Unable to create hospital. Check your connection and try again.");
        } finally {
            setCreating(false);
        }
    };

    const updateStatus = async (hospital: Hospital, nextStatus: "ACTIVE" | "INACTIVE") => {
        setBusyHospitalId(hospital.hospital_id);
        setError("");
        setSuccess("");

        try {
            const response = await fetch(`/api/hms/super-admin/hospitals/${hospital.hospital_id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to update hospital status.");
                return;
            }

            setHospitals((prev) => prev.map((item) => item.hospital_id === hospital.hospital_id ? { ...item, status: nextStatus } : item));
            setTotals((prev) => ({
                ...prev,
                active: nextStatus === "ACTIVE" ? prev.active + 1 : Math.max(0, prev.active - 1),
                inactive: nextStatus === "INACTIVE" ? prev.inactive + 1 : Math.max(0, prev.inactive - 1),
            }));
            setSuccess(`${hospital.code} marked ${nextStatus}.`);
        } catch {
            setError("Unable to update hospital status. Check your connection and try again.");
        } finally {
            setBusyHospitalId(null);
        }
    };

    const deleteHospital = async (hospital: Hospital) => {
        setBusyHospitalId(hospital.hospital_id);
        setError("");
        setSuccess("");

        try {
            const response = await fetch(`/api/hms/super-admin/hospitals/${hospital.hospital_id}`, {
                method: "DELETE",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to delete hospital.");
                return;
            }

            setHospitals((prev) => prev.filter((item) => item.hospital_id !== hospital.hospital_id));
            setTotals((prev) => ({
                hospitals: Math.max(0, prev.hospitals - 1),
                active: hospital.status === "ACTIVE" ? Math.max(0, prev.active - 1) : prev.active,
                inactive: hospital.status !== "ACTIVE" ? Math.max(0, prev.inactive - 1) : prev.inactive,
                admins: prev.admins,
            }));
            setSuccess(`${hospital.code} deleted.`);
        } catch {
            setError("Unable to delete hospital. Check your connection and try again.");
        } finally {
            setBusyHospitalId(null);
        }
    };

    const confirmTitle = confirmAction?.type === "DELETE"
        ? "Delete hospital?"
        : confirmAction?.hospital.status === "ACTIVE"
            ? "Deactivate hospital?"
            : "Activate hospital?";

    const confirmMessage = confirmAction?.type === "DELETE"
        ? `Delete ${confirmAction.hospital.code} / ${confirmAction.hospital.name}? This will remove the hospital and its dedicated admin account.`
        : `Are you sure you want to ${confirmAction?.hospital.status === "ACTIVE" ? "deactivate" : "activate"} ${confirmAction?.hospital.code} / ${confirmAction?.hospital.name}?`;

    const runConfirmedAction = async () => {
        if (!confirmAction) return;
        const action = confirmAction;
        setConfirmAction(null);
        if (action.type === "DELETE") {
            await deleteHospital(action.hospital);
            return;
        }
        await updateStatus(action.hospital, action.hospital.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    };

    const openSmsSettings = (hospital: Hospital) => {
        setSmsHospital(hospital);
        setSmsEnabled(Boolean(hospital.sms_service?.enabled));
        setSmsRechargeCredits("");
        setSmsRechargeRemarks("");
        setError("");
        setSuccess("");
    };

    const saveSmsSettings = async () => {
        if (!smsHospital || smsSaving) return;
        const credits = smsRechargeCredits.trim() ? Number(smsRechargeCredits) : 0;
        if (!Number.isInteger(credits) || credits < 0) {
            setError("SMS recharge must be a whole number.");
            return;
        }

        setSmsSaving(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch(`/api/hms/super-admin/hospitals/${smsHospital.hospital_id}/sms`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sms_service_enabled: smsEnabled,
                    sms_recharge_credits: credits,
                    sms_recharge_remarks: smsRechargeRemarks.trim() || null,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to update hospital SMS.");
                return;
            }

            setHospitals((prev) => prev.map((item) => item.hospital_id === smsHospital.hospital_id
                ? { ...item, sms_service: data.sms_service || item.sms_service }
                : item
            ));
            setSmsHospital(null);
            setSuccess(`${smsHospital.code} SMS updated.`);
        } catch {
            setError("Unable to update hospital SMS. Check your connection and try again.");
        } finally {
            setSmsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="border-b border-gray-200 bg-white">
                <div className="mx-auto flex max-w-[1560px] items-center justify-between px-3 py-4 sm:px-4 lg:px-5">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-white">
                            <ShieldCheck size={19} />
                        </span>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">HMS</p>
                            <h1 className="text-lg font-bold text-gray-950">Super Admin</h1>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/hms/super-admin/hospitals/feature-flags"
                            className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-900"
                        >
                            <Settings size={16} />
                            Feature Flags
                        </Link>
                        <Link
                            href="/dashboard/admin"
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            <LayoutDashboard size={16} />
                            Dashboard
                        </Link>
                    </div>
                </div>
            </div>

            <main className="mx-auto max-w-[1560px] px-3 py-6 sm:px-4 lg:px-5">
                {error && <HmsStatusAlert tone="error" message={error} onDismiss={clearError} />}
                {success && <HmsStatusAlert tone="success" message={success} onDismiss={clearSuccess} />}

                {temporaryPassword && (
                    <div className="mb-4 rounded-lg border border-gray-300 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Admin Temporary Password</p>
                        <div className="mt-2 flex items-center gap-2">
                            <code className="min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-950">
                                {temporaryPassword}
                            </code>
                            <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(temporaryPassword)}
                                className="inline-flex items-center justify-center rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                            >
                                <Copy size={15} />
                            </button>
                        </div>
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric label="Hospitals" value={totals.hospitals} />
                    <Metric label="Active" value={totals.active} />
                    <Metric label="Inactive" value={totals.inactive} />
                    <Metric label="Admins" value={totals.admins} />
                </div>

                <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                            <h2 className="text-sm font-semibold text-gray-950">Hospitals</h2>
                            <button
                                type="button"
                                onClick={() => void loadHospitals()}
                                disabled={loading}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                                Refresh
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                                <Loader2 size={16} className="animate-spin" />
                                Loading hospitals
                            </div>
                        ) : sortedHospitals.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-gray-500">No HMS hospitals created.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-[1180px] w-full table-fixed text-left text-sm">
                                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                                        <tr>
                                            <th className="w-[24%] px-3 py-3 font-semibold">Hospital</th>
                                            <th className="w-[21%] px-3 py-3 font-semibold">Admin</th>
                                            <th className="w-[8%] px-2 py-3 font-semibold">Config</th>
                                            <th className="w-[10%] px-2 py-3 font-semibold">Usage</th>
                                            <th className="w-[10%] px-2 py-3 font-semibold">SMS</th>
                                            <th className="w-[12%] px-3 py-3 font-semibold">Status</th>
                                            <th className="w-[15%] px-3 py-3 text-right font-semibold">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedHospitals.map((hospital) => (
                                            <tr key={hospital.hospital_id} className="border-t border-gray-100">
                                                <td className="px-3 py-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-white">
                                                            <Building2 size={15} />
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="break-words font-semibold leading-snug text-gray-950">{hospital.name}</p>
                                                            <p className="break-words text-xs leading-snug text-gray-500">
                                                                {hospital.code} / Admin ID {hospital.admin_id}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <p className="break-words font-medium leading-snug text-gray-800">{hospital.admin_user?.name || "-"}</p>
                                                    <p className="break-all text-xs leading-snug text-gray-500">{hospital.admin_user?.email || "No login user"}</p>
                                                </td>
                                                <td className="px-2 py-3 text-xs text-gray-600">
                                                    <div className="flex flex-wrap gap-1">
                                                        <ConfigPill label="P" enabled={hospital.config.policy_configured} title="Policy" />
                                                        <ConfigPill label="F" enabled={hospital.config.feature_configured} title="Feature Flags" />
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3 text-xs font-medium text-gray-700">
                                                    <p>{hospital.counts.doctors} Dr</p>
                                                    <p>{hospital.counts.staff} Staff</p>
                                                    <p>{hospital.counts.visits} Visits</p>
                                                </td>
                                                <td className="px-2 py-3">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="whitespace-nowrap font-semibold text-gray-950">{hospital.sms_service?.displayText || "0/0 left"}</span>
                                                        <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                            hospital.sms_service?.status === "ACTIVE"
                                                                ? "bg-emerald-50 text-emerald-700"
                                                                : hospital.sms_service?.status === "EXHAUSTED"
                                                                    ? "bg-red-50 text-red-700"
                                                                    : "bg-gray-100 text-gray-700"
                                                        }`}>
                                                            {hospital.sms_service?.status || "DISABLED"}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                        hospital.status === "ACTIVE"
                                                            ? "bg-emerald-50 text-emerald-700"
                                                            : "bg-gray-100 text-gray-700"
                                                    }`}>
                                                        {hospital.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 pl-5">
                                                    <div className="flex flex-nowrap justify-end gap-2">
                                                        <Link
                                                            href={`/hms/super-admin/hospitals/feature-flags?hospitalId=${hospital.hospital_id}`}
                                                            title="Feature Flags"
                                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        >
                                                            <Settings size={14} />
                                                        </Link>
                                                        <Link
                                                            href={`/hms/super-admin/hospitals/${hospital.hospital_id}/emr-layout`}
                                                            title="EMR Layout"
                                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        >
                                                            <LayoutDashboard size={14} />
                                                        </Link>
                                                        <button
                                                            type="button"
                                                            disabled={busyHospitalId === hospital.hospital_id}
                                                            onClick={() => openSmsSettings(hospital)}
                                                            title="SMS"
                                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                                        >
                                                            <MessageSquare size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busyHospitalId === hospital.hospital_id}
                                                            onClick={() => setConfirmAction({ type: "TOGGLE", hospital })}
                                                            title={hospital.status === "ACTIVE" ? "Deactivate" : "Activate"}
                                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                                        >
                                                            {hospital.status === "ACTIVE" ? <PowerOff size={14} /> : <Power size={14} />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busyHospitalId === hospital.hospital_id}
                                                            onClick={() => setConfirmAction({ type: "DELETE", hospital })}
                                                            title="Delete"
                                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <form onSubmit={createHospital} className="rounded-lg border border-gray-200 bg-white p-4 2xl:sticky 2xl:top-6 2xl:self-start">
                        <div className="mb-4 flex items-center gap-2">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
                                <Plus size={16} />
                            </span>
                            <h2 className="text-sm font-semibold text-gray-950">Create Hospital</h2>
                        </div>
                        <div className="space-y-4">
                            <Field label="Hospital Code" value={form.code} error={fieldErrors.code} onChange={(value) => updateField("code", value)} />
                            <Field label="Hospital Name" value={form.name} error={fieldErrors.name} onChange={(value) => updateField("name", value)} />
                            <SelectField label="Status" value={form.status} options={["ACTIVE", "INACTIVE"]} onChange={(value) => updateField("status", value)} />
                            <Field label="Admin Name" value={form.admin_name} error={fieldErrors.admin_name} onChange={(value) => updateField("admin_name", value)} />
                            <Field label="Admin Email" type="email" value={form.admin_email} error={fieldErrors.admin_email} onChange={(value) => updateField("admin_email", value)} />
                        </div>
                        <button
                            type="submit"
                            disabled={creating}
                            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            Create Hospital
                        </button>
                    </form>
                </div>
            </main>

            {confirmAction && (
                <ConfirmModal
                    title={confirmTitle}
                    message={confirmMessage}
                    busy={busyHospitalId === confirmAction.hospital.hospital_id}
                    confirmLabel={confirmAction.type === "DELETE" ? "Delete" : confirmAction.hospital.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    danger={confirmAction.type === "DELETE" || confirmAction.hospital.status === "ACTIVE"}
                    onCancel={() => setConfirmAction(null)}
                    onConfirm={() => void runConfirmedAction()}
                />
            )}
            {smsHospital && (
                <SmsSettingsModal
                    hospital={smsHospital}
                    enabled={smsEnabled}
                    credits={smsRechargeCredits}
                    remarks={smsRechargeRemarks}
                    saving={smsSaving}
                    onEnabledChange={setSmsEnabled}
                    onCreditsChange={setSmsRechargeCredits}
                    onRemarksChange={setSmsRechargeRemarks}
                    onCancel={() => setSmsHospital(null)}
                    onSave={() => void saveSmsSettings()}
                />
            )}
        </div>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-950">{value}</p>
        </div>
    );
}

function ConfigPill({ label, enabled, title }: { label: string; enabled: boolean; title?: string }) {
    return (
        <span className={`mr-1 inline-flex rounded-full px-2 py-1 font-semibold ${
            enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
        }`} title={title}>
            {label}
        </span>
    );
}

function Field({
    label,
    value,
    error,
    type = "text",
    onChange,
}: {
    label: string;
    value: string;
    error?: string;
    type?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${
                    error ? "border-red-300" : "border-gray-200"
                }`}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}

function SelectField({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            >
                {options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </div>
    );
}

function ConfirmModal({
    title,
    message,
    busy,
    confirmLabel,
    danger = false,
    onCancel,
    onConfirm,
}: {
    title: string;
    message: string;
    busy: boolean;
    confirmLabel: string;
    danger?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
                <h2 className="text-base font-semibold text-gray-950">{title}</h2>
                <p className="mt-2 text-sm text-gray-700">{message}</p>
                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-black hover:bg-gray-900"}`}
                    >
                        {busy && <Loader2 size={15} className="animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

function SmsSettingsModal({
    hospital,
    enabled,
    credits,
    remarks,
    saving,
    onEnabledChange,
    onCreditsChange,
    onRemarksChange,
    onCancel,
    onSave,
}: {
    hospital: Hospital;
    enabled: boolean;
    credits: string;
    remarks: string;
    saving: boolean;
    onEnabledChange: (value: boolean) => void;
    onCreditsChange: (value: string) => void;
    onRemarksChange: (value: string) => void;
    onCancel: () => void;
    onSave: () => void;
}) {
    const rechargeValue = Number(credits || 0);
    const currentRemaining = hospital.sms_service?.remainingCredits || 0;
    const currentTotal = hospital.sms_service?.totalCredits || 0;
    const rechargeAmount = Number.isFinite(rechargeValue) && rechargeValue > 0 ? rechargeValue : 0;
    const nextRemaining = currentRemaining + rechargeAmount;
    const nextTotal = rechargeAmount > 0
        ? currentRemaining > 0
            ? currentTotal + rechargeAmount
            : rechargeAmount
        : currentTotal;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-white">
                        <MessageSquare size={18} />
                    </span>
                    <div>
                        <h2 className="text-base font-semibold text-gray-950">Hospital SMS</h2>
                        <p className="text-sm text-gray-600">{hospital.name}</p>
                    </div>
                </div>

                <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-3">
                    <ProfileMetric label="Current" value={hospital.sms_service?.displayText || "0/0 left"} />
                    <ProfileMetric label="Status" value={hospital.sms_service?.status || "DISABLED"} />
                    <ProfileMetric label="After Recharge" value={`${nextRemaining}/${nextTotal} left`} />
                </div>

                <div className="mt-4 space-y-4">
                    <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-3">
                        <span>
                            <span className="block text-sm font-semibold text-gray-950">SMS Enabled</span>
                            <span className="block text-xs text-gray-600">Allow this hospital to use its SMS credits.</span>
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            onClick={() => onEnabledChange(!enabled)}
                            className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-black" : "bg-gray-300"}`}
                        >
                            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${enabled ? "left-6" : "left-1"}`} />
                        </button>
                    </label>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Add SMS Credits</label>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={credits}
                            onChange={(event) => onCreditsChange(event.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-950 outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                            placeholder="0"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Remarks</label>
                        <input
                            type="text"
                            value={remarks}
                            onChange={(event) => onRemarksChange(event.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-950 outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                            placeholder="Optional"
                        />
                    </div>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                    >
                        {saving && <Loader2 size={15} className="animate-spin" />}
                        Save SMS
                    </button>
                </div>
            </div>
        </div>
    );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-600">{label}</p>
            <p className="mt-1 font-semibold text-gray-950">{value}</p>
        </div>
    );
}
