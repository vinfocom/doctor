"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Pencil, Plus, Power, PowerOff, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { HmsLabelWithInfo } from "@/components/hms/HmsInfoHint";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

type DoctorOption = {
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
    status: string | null;
};

type StaffAccount = {
    staff_id: number;
    user_id: number;
    name: string | null;
    email: string | null;
    staff_type: string;
    status: string | null;
    valid_from: string | null;
    valid_to: string | null;
    assigned_doctor_count: number;
    assigned_doctors: DoctorOption[];
};

type FormState = {
    name: string;
    email: string;
    valid_from: string;
    valid_to: string;
    doctor_ids: number[];
};

const emptyForm: FormState = {
    name: "",
    email: "",
    valid_from: "",
    valid_to: "",
    doctor_ids: [],
};

type ConfirmAction =
    | { type: "RESET"; account: StaffAccount }
    | { type: "DELETE"; account: StaffAccount }
    | { type: "TOGGLE"; account: StaffAccount };

function todayYmd() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isAccountActive(account: StaffAccount) {
    const today = todayYmd();
    if (String(account.status || "").toUpperCase() === "INACTIVE") return false;
    const validFrom = toInputDate(account.valid_from);
    const validTo = toInputDate(account.valid_to);
    if (validFrom && validFrom > today) return false;
    if (validTo && validTo < today) return false;
    return true;
}

function formatDate(value: string | null) {
    if (!value) return "-";
    const input = toInputDate(value);
    if (!input) return "-";
    const [year, month, day] = input.split("-");
    return `${day}/${month}/${year}`;
}

function toInputDate(value: string | null) {
    if (!value) return "";
    const direct = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function doctorIdsFromAccount(account: StaffAccount) {
    return (account.assigned_doctors || [])
        .map((doctor) => Number(doctor?.doctor_id))
        .filter((id) => Number.isInteger(id) && id > 0);
}

function isExpiredByValidTo(account: StaffAccount) {
    const validTo = toInputDate(account.valid_to);
    return Boolean(validTo && validTo < todayYmd());
}

function validateForm(form: FormState) {
    const errors: Partial<Record<keyof FormState, string>> = {};

    if (!form.name.trim()) errors.name = "Name is required.";
    if (!form.email.trim()) errors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address.";
    if (!form.doctor_ids.length) errors.doctor_ids = "Assign at least one doctor.";
    if (form.valid_from && form.valid_to && form.valid_from > form.valid_to) errors.valid_to = "Valid to must be on or after valid from.";

    return errors;
}

export default function HmsStaffClient() {
    const [staff, setStaff] = useState<StaffAccount[]>([]);
    const [doctors, setDoctors] = useState<DoctorOption[]>([]);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [editingStaffId, setEditingStaffId] = useState<number | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [resettingUserId, setResettingUserId] = useState<number | null>(null);
    const [temporaryPassword, setTemporaryPassword] = useState("");
    const [copiedPassword, setCopiedPassword] = useState(false);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [reactivateValidTo, setReactivateValidTo] = useState("");
    const [actingStaffId, setActingStaffId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const clearError = useCallback(() => setError(""), []);
    const clearSuccess = useCallback(() => setSuccess(""), []);

    useHmsAutoDismissMessage(error, clearError, 7500);
    useHmsAutoDismissMessage(success, clearSuccess, 5000);

    const sortedStaff = useMemo(() => {
        return [...staff].sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
    }, [staff]);

    const loadStaff = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/hms/hospital-admin/staff", { cache: "no-store" });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || "Unable to load staff.");
                return;
            }

            setStaff(Array.isArray(data.staff) ? data.staff : []);
            setDoctors(Array.isArray(data.doctors) ? data.doctors : []);
        } catch {
            setError("Unable to load staff. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadStaff();
    }, [loadStaff]);

    const updateField = (field: keyof FormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
        setSuccess("");
    };

    const toggleDoctor = (doctorId: number) => {
        setForm((prev) => ({
            ...prev,
            doctor_ids: prev.doctor_ids.includes(doctorId)
                ? prev.doctor_ids.filter((id) => id !== doctorId)
                : [...prev.doctor_ids, doctorId],
        }));
        setFieldErrors((prev) => ({ ...prev, doctor_ids: undefined }));
        setSuccess("");
    };

    const startEdit = (account: StaffAccount) => {
        setEditingStaffId(account.staff_id);
        setForm({
            name: account.name || "",
            email: account.email || "",
            valid_from: toInputDate(account.valid_from),
            valid_to: toInputDate(account.valid_to),
            doctor_ids: doctorIdsFromAccount(account),
        });
        setFieldErrors({});
        setError("");
        setSuccess("");
    };

    const cancelEdit = () => {
        setEditingStaffId(null);
        setForm(emptyForm);
        setFieldErrors({});
    };

    const handleSubmit = async (event: React.FormEvent) => {
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

        setSubmitting(true);
        try {
            const res = await fetch(editingStaffId ? `/api/hms/hospital-admin/staff/${editingStaffId}` : "/api/hms/hospital-admin/staff", {
                method: editingStaffId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name.trim(),
                    email: form.email.trim(),
                    valid_from: form.valid_from || null,
                    valid_to: form.valid_to || null,
                    doctor_ids: form.doctor_ids,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || "Unable to create staff.");
                setFieldErrors(data.fieldErrors || {});
                return;
            }

            setStaff((prev) => editingStaffId
                ? prev.map((account) => account.staff_id === editingStaffId ? data.staff : account)
                : [...prev, data.staff]);
            setForm(emptyForm);
            setEditingStaffId(null);
            setFieldErrors({});
            setTemporaryPassword(data.temporaryPassword || "");
            setCopiedPassword(false);
            setSuccess(editingStaffId ? "Registration staff updated." : "Registration staff created. Copy the temporary password now.");
        } catch {
            setError(`Unable to ${editingStaffId ? "update" : "create"} staff. Check your connection and try again.`);
        } finally {
            setSubmitting(false);
        }
    };

    const resetPassword = async (account: StaffAccount) => {
        setError("");
        setSuccess("");
        setTemporaryPassword("");
        setCopiedPassword(false);
        setResettingUserId(account.user_id);

        try {
            const res = await fetch(`/api/hms/hospital-admin/users/${account.user_id}/reset-password`, {
                method: "POST",
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || "Unable to reset password.");
                return;
            }

            setTemporaryPassword(data.temporaryPassword || "");
            setSuccess("Password reset. Copy the temporary password now.");
        } catch {
            setError("Unable to reset password. Check your connection and try again.");
        } finally {
            setResettingUserId(null);
        }
    };

    const deleteAccount = async (account: StaffAccount) => {
        setActingStaffId(account.staff_id);
        setError("");
        setSuccess("");
        try {
            const res = await fetch(`/api/hms/hospital-admin/staff/${account.staff_id}`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || "Unable to delete staff account.");
                return;
            }
            setStaff((prev) => prev.filter((item) => item.staff_id !== account.staff_id));
            setSuccess("Staff account deleted.");
        } catch {
            setError("Unable to delete staff account. Check your connection and try again.");
        } finally {
            setActingStaffId(null);
        }
    };

    const toggleAccount = async (account: StaffAccount) => {
        const active = isAccountActive(account);
        setActingStaffId(account.staff_id);
        setError("");
        setSuccess("");
        try {
            const res = await fetch(`/api/hms/hospital-admin/staff/${account.staff_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: active ? "DEACTIVATE" : "ACTIVATE", valid_to: active ? null : reactivateValidTo || null }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || "Unable to update staff status.");
                return;
            }
            setStaff((prev) => prev.map((item) => item.staff_id === account.staff_id ? data.staff : item));
            setSuccess(active ? "Staff account deactivated." : "Staff account activated.");
        } catch {
            setError("Unable to update staff status. Check your connection and try again.");
        } finally {
            setActingStaffId(null);
        }
    };

    const runConfirmedAction = async () => {
        const action = confirmAction;
        setConfirmAction(null);
        if (!action) return;
        if (action.type === "TOGGLE" && !isAccountActive(action.account) && !reactivateValidTo) {
            setConfirmAction(action);
            setError("Set valid to date before activating this account.");
            return;
        }
        if (action.type === "RESET") await resetPassword(action.account);
        if (action.type === "DELETE") await deleteAccount(action.account);
        if (action.type === "TOGGLE") await toggleAccount(action.account);
    };

    return (
        <div className="w-full">
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hospital Admin</p>
                    <h1 className="mt-1 text-2xl font-bold text-gray-950 sm:text-3xl">Staff</h1>
                </div>
                <button
                    type="button"
                    onClick={() => void loadStaff()}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {error && <HmsStatusAlert tone="error" message={error} onDismiss={clearError} />}
            {success && <HmsStatusAlert tone="success" message={success} onDismiss={clearSuccess} />}

            {temporaryPassword && <TempPasswordModal password={temporaryPassword} copied={copiedPassword} onCopy={() => { void navigator.clipboard.writeText(temporaryPassword); setCopiedPassword(true); }} onClose={() => setTemporaryPassword("")} />}
            {confirmAction && (
                <ConfirmModal
                    title={confirmAction.type === "RESET" ? "Reset password?" : confirmAction.type === "DELETE" ? "Delete staff account?" : isAccountActive(confirmAction.account) ? "Deactivate staff account?" : "Activate staff account?"}
                    message={confirmAction.type === "RESET" ? "A new temporary password will be shown once." : confirmAction.type === "DELETE" ? "This staff login and doctor access will be removed." : isAccountActive(confirmAction.account) ? "This account will not be able to log in." : "This account will be active from today if the valid dates were expired."}
                    validTo={confirmAction.type === "TOGGLE" && !isAccountActive(confirmAction.account) ? reactivateValidTo : undefined}
                    onValidToChange={setReactivateValidTo}
                    requireValidTo={confirmAction.type === "TOGGLE" && !isAccountActive(confirmAction.account) && isExpiredByValidTo(confirmAction.account)}
                    onCancel={() => setConfirmAction(null)}
                    onConfirm={() => void runConfirmedAction()}
                />
            )}

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 px-4 py-3">
                        <h2 className="text-sm font-semibold text-gray-950">Registration Staff</h2>
                    </div>
                    {loading ? (
                        <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                            <Loader2 size={16} className="animate-spin" />
                            Loading staff
                        </div>
                    ) : sortedStaff.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-gray-500">No registration staff created.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">Staff</th>
                                        <th className="px-4 py-3 font-semibold">Assigned Doctors</th>
                                        <th className="px-4 py-3 font-semibold">Status</th>
                                        <th className="px-4 py-3 font-semibold">Valid</th>
                                        <th className="px-4 py-3 font-semibold">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedStaff.map((account) => (
                                        <tr key={account.staff_id} className="border-t border-gray-100">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
                                                        <UserPlus size={16} />
                                                    </span>
                                                    <div>
                                                        <p className="font-semibold text-gray-950">{account.name || `Staff ${account.staff_id}`}</p>
                                                        <p className="text-xs text-gray-500">{account.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <DoctorHoverList doctors={account.assigned_doctors} />
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-700">{isAccountActive(account) ? "ACTIVE" : "INACTIVE"}</td>
                                            <td className="px-4 py-3 text-gray-600">{formatDate(account.valid_from)} to {formatDate(account.valid_to)}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <IconButton label="Edit" onClick={() => startEdit(account)} icon={<Pencil size={15} />} />
                                                    <IconButton label={isAccountActive(account) ? "Deactivate" : "Activate"} disabled={actingStaffId === account.staff_id} onClick={() => { setReactivateValidTo(""); setConfirmAction({ type: "TOGGLE", account }); }} icon={isAccountActive(account) ? <PowerOff size={15} /> : <Power size={15} />} />
                                                    <IconButton label="Reset Password" disabled={resettingUserId === account.user_id} onClick={() => setConfirmAction({ type: "RESET", account })} icon={<KeyRound size={15} />} />
                                                    <IconButton label="Delete" danger disabled={actingStaffId === account.staff_id} onClick={() => setConfirmAction({ type: "DELETE", account })} icon={<Trash2 size={15} />} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="mb-4 flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
                            <Plus size={16} />
                        </span>
                        <h2 className="text-sm font-semibold text-gray-950">{editingStaffId ? "Edit Registration Staff" : "Create Registration Staff"}</h2>
                        {editingStaffId ? <button type="button" onClick={cancelEdit} className="ml-auto text-xs font-semibold text-black underline">Cancel edit</button> : null}
                    </div>

                    <div className="space-y-4">
                        <Field label="Name" required value={form.name} error={fieldErrors.name} onChange={(value) => updateField("name", value)} />
                        <Field label="Email" required type="email" value={form.email} error={fieldErrors.email} onChange={(value) => updateField("email", value)} />
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Valid From" type="date" value={form.valid_from} error={fieldErrors.valid_from} onChange={(value) => updateField("valid_from", value)} />
                            <Field label="Valid To" type="date" value={form.valid_to} error={fieldErrors.valid_to} onChange={(value) => updateField("valid_to", value)} />
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-medium text-gray-600">
                                <HmsLabelWithInfo
                                    label="Doctors *"
                                    info="This staff member can register patients only for the selected doctors."
                                />
                            </label>
                            <div className={`max-h-52 overflow-y-auto rounded-lg border ${fieldErrors.doctor_ids ? "border-red-300" : "border-gray-200"}`}>
                                {doctors.length === 0 ? (
                                    <div className="px-3 py-3 text-sm text-gray-500">No HMS doctors available.</div>
                                ) : doctors.map((doctor) => (
                                    <label key={doctor.doctor_id} className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50">
                                        <input
                                            type="checkbox"
                                            checked={form.doctor_ids.includes(doctor.doctor_id)}
                                            onChange={() => toggleDoctor(doctor.doctor_id)}
                                            className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                                        />
                                        <span className="min-w-0 text-sm">
                                            <span className="block truncate font-medium text-gray-900">{doctor.doctor_name || `Doctor ${doctor.doctor_id}`}</span>
                                            <span className="block text-xs text-gray-500">Room {doctor.room_no || "-"}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                            {fieldErrors.doctor_ids && <p className="mt-1 text-xs text-red-600">{fieldErrors.doctor_ids}</p>}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        {editingStaffId ? "Save Staff" : "Create Staff"}
                    </button>
                </form>
            </div>
        </div>
    );
}

function Field({
    label,
    required = false,
    value,
    error,
    type = "text",
    onChange,
}: {
    label: string;
    required?: boolean;
    value: string;
    error?: string;
    type?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{label}{required ? " *" : ""}</label>
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

function DoctorHoverList({ doctors }: { doctors: DoctorOption[] }) {
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    const list = doctors.filter(Boolean);
    if (!list.length) return <span className="text-sm font-semibold text-black">-</span>;

    return (
        <div
            className="inline-flex"
            onMouseEnter={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setPosition({ left: rect.left, top: rect.bottom + 6 });
            }}
            onMouseLeave={() => setPosition(null)}
        >
            <span className="max-w-[150px] truncate rounded-lg border border-black px-2 py-1 text-xs font-bold text-black">
                {list.length} doctor{list.length === 1 ? "" : "s"}
            </span>
            {position ? (
                <div
                    className="fixed z-[80] max-h-56 w-64 overflow-y-auto rounded-lg border border-black bg-white p-2 text-xs font-semibold text-black shadow-xl"
                    style={{ left: position.left, top: position.top }}
                >
                    {list.map((doctor) => (
                        <div key={doctor.doctor_id} className="border-b border-black px-2 py-1 last:border-b-0">
                            Dr. {doctor.doctor_name || `Doctor ${doctor.doctor_id}`} | {doctor.room_no || "-"}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function TempPasswordModal({
    password,
    copied,
    onCopy,
    onClose,
}: {
    password: string;
    copied: boolean;
    onCopy: () => void;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-lg border border-black bg-white shadow-xl">
                <div className="flex items-start justify-between gap-3 border-b border-black px-4 py-3">
                    <div>
                        <p className="text-xs font-bold uppercase text-black">Temporary Password</p>
                        <h2 className="mt-1 text-base font-bold text-black">Copy this password now</h2>
                    </div>
                    <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black text-black hover:bg-black hover:text-white" aria-label="Close temporary password">
                        <X size={15} />
                    </button>
                </div>
                <div className="px-4 py-4">
                    <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 rounded-lg border border-black bg-white px-3 py-2 text-sm font-bold text-black">{password}</code>
                        <button type="button" onClick={onCopy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-bold text-white">
                            {copied ? <Check size={15} /> : <Copy size={15} />}
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function IconButton({
    label,
    icon,
    onClick,
    disabled = false,
    danger = false,
}: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-semibold disabled:opacity-50 ${
                danger ? "border-red-700 text-red-700 hover:bg-red-700 hover:text-white" : "border-black text-black hover:bg-black hover:text-white"
            }`}
        >
            {icon}
        </button>
    );
}

function ConfirmModal({
    title,
    message,
    validTo,
    onValidToChange,
    requireValidTo = false,
    onCancel,
    onConfirm,
}: {
    title: string;
    message: string;
    validTo?: string;
    onValidToChange?: (value: string) => void;
    requireValidTo?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-sm rounded-lg border border-black bg-white p-4 text-black shadow-xl">
                <h2 className="text-lg font-bold text-black">{title}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-black">{message}</p>
                {validTo !== undefined ? (
                    <label className="mt-4 block space-y-1">
                        <span className="text-xs font-bold uppercase text-black">Valid To{requireValidTo ? " *" : ""}</span>
                        <input
                            type="date"
                            value={validTo}
                            onChange={(event) => onValidToChange?.(event.target.value)}
                            className="w-full rounded-lg border border-black px-3 py-2 text-sm font-bold text-black outline-none"
                        />
                    </label>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="rounded-lg border border-black px-4 py-2 text-sm font-bold text-black hover:bg-black hover:text-white">Cancel</button>
                    <button type="button" onClick={onConfirm} className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white">Confirm</button>
                </div>
            </div>
        </div>
    );
}
