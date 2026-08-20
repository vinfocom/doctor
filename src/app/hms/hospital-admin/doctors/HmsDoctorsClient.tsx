"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Pencil, Plus, Power, PowerOff, RefreshCw, Stethoscope, Trash2, Upload, X } from "lucide-react";
import { HmsLabelWithInfo } from "@/components/hms/HmsInfoHint";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

type HmsDoctor = {
    doctor_id: number;
    user_id: number | null;
    doctor_name: string | null;
    email: string | null;
    phone: string | null;
    specialization: string | null;
    registration_no: string | null;
    education: string | null;
    profile_pic_url: string | null;
    active_from: string | null;
    active_to: string | null;
    status: string | null;
    room_no: string | null;
    daily_capacity: number | null;
    capacity_count_categories: string[];
    sit_days: number[];
    clinic_count: number;
};

type DoctorFormState = {
    doctor_name: string;
    email: string;
    room_no: string;
    daily_capacity: string;
    capacity_count_categories: string[];
    sit_days: number[];
    phone: string;
    specialization: string;
    registration_no: string;
    education: string;
    profile_pic_url: string;
    active_from: string;
    active_to: string;
};

const emptyForm: DoctorFormState = {
    doctor_name: "",
    email: "",
    room_no: "",
    daily_capacity: "100",
    capacity_count_categories: ["NEW", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"],
    sit_days: [1, 2, 3, 4, 5, 6],
    phone: "",
    specialization: "",
    registration_no: "",
    education: "",
    profile_pic_url: "",
    active_from: "",
    active_to: "",
};

const capacityCategoryOptions = ["NEW", "OLD_WITHIN_FOLLOWUP_VALIDITY", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"];
const weekdayOptions = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
];

type ConfirmAction =
    | { type: "RESET"; doctor: HmsDoctor }
    | { type: "DELETE"; doctor: HmsDoctor }
    | { type: "TOGGLE"; doctor: HmsDoctor };

function todayYmd() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isDoctorCurrentlyActive(doctor: HmsDoctor) {
    const today = todayYmd();
    if (String(doctor.status || "").toUpperCase() === "INACTIVE") return false;
    const activeFrom = toInputDate(doctor.active_from);
    const activeTo = toInputDate(doctor.active_to);
    if (activeFrom && activeFrom > today) return false;
    if (activeTo && activeTo < today) return false;
    return true;
}

function toInputDate(value: string | null) {
    if (!value) return "";
    const direct = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function isExpiredByActiveTo(doctor: HmsDoctor) {
    const activeTo = toInputDate(doctor.active_to);
    return Boolean(activeTo && activeTo < todayYmd());
}

function confirmTitle(action: ConfirmAction) {
    if (action.type === "RESET") return "Reset password?";
    if (action.type === "DELETE") return "Delete doctor?";
    return isDoctorCurrentlyActive(action.doctor) ? "Deactivate doctor?" : "Activate doctor?";
}

function confirmMessage(action: ConfirmAction) {
    const name = `Dr. ${action.doctor.doctor_name || `Doctor ${action.doctor.doctor_id}`}`;
    if (action.type === "RESET") return `Reset password for ${name}? A new temporary password will be shown once.`;
    if (action.type === "DELETE") return `Delete ${name}? This is allowed only when no visit or EMR record exists.`;
    return isDoctorCurrentlyActive(action.doctor)
        ? `${name} will not be able to log in after deactivation.`
        : `${name} will become active from today with a future active-to date if needed.`;
}

function sitDaysLabel(days: number[] | null | undefined) {
    const selected = Array.isArray(days) ? days : [];
    if (selected.length === 0) return "-";
    return selected
        .map((day) => weekdayOptions.find((option) => option.value === day)?.label)
        .filter(Boolean)
        .join(", ");
}

function profilePhotoFileName(url: string) {
    const clean = String(url || "").trim();
    if (!clean) return "";
    const path = clean.split("?")[0] || clean;
    const rawName = path.split("/").filter(Boolean).pop() || "Profile photo";
    const decodedName = decodeURIComponent(rawName);
    return decodedName.replace(/^\d+[_-]/, "") || "Profile photo";
}

function validateForm(form: DoctorFormState) {
    const errors: Partial<Record<keyof DoctorFormState, string>> = {};

    if (!form.doctor_name.trim()) errors.doctor_name = "Doctor name is required.";
    if (!form.email.trim()) errors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address.";
    if (!form.room_no.trim()) errors.room_no = "Room number is required.";
    const dailyCapacity = Number(form.daily_capacity);
    if (!Number.isInteger(dailyCapacity) || dailyCapacity <= 0) errors.daily_capacity = "Daily capacity must be a whole number above zero.";
    if (!form.capacity_count_categories.length) errors.capacity_count_categories = "Select at least one category.";
    if (!form.sit_days.length) errors.sit_days = "Select at least one sitting day.";
    if (!form.specialization.trim()) errors.specialization = "Specialization is required.";
    if (!form.registration_no.trim()) errors.registration_no = "Registration number is required.";
    if (!form.active_from) errors.active_from = "Active from date is required.";
    if (!form.active_to) errors.active_to = "Active to date is required.";
    if (form.active_from && form.active_to && form.active_from > form.active_to) errors.active_to = "Active to must be on or after active from.";

    return errors;
}

export default function HmsDoctorsClient() {
    const [doctors, setDoctors] = useState<HmsDoctor[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [editingDoctorId, setEditingDoctorId] = useState<number | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof DoctorFormState, string>>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingProfile, setUploadingProfile] = useState(false);
    const [resettingUserId, setResettingUserId] = useState<number | null>(null);
    const [temporaryPassword, setTemporaryPassword] = useState("");
    const [copiedPassword, setCopiedPassword] = useState(false);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [reactivateActiveTo, setReactivateActiveTo] = useState("");
    const [actingDoctorId, setActingDoctorId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const clearError = useCallback(() => setError(""), []);
    const clearSuccess = useCallback(() => setSuccess(""), []);

    useHmsAutoDismissMessage(error, clearError, 7500);
    useHmsAutoDismissMessage(success, clearSuccess, 5000);

    const sortedDoctors = useMemo(() => {
        return [...doctors].sort((left, right) =>
            String(left.doctor_name || "").localeCompare(String(right.doctor_name || ""))
        );
    }, [doctors]);

    const loadDoctors = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/hms/hospital-admin/doctors", { cache: "no-store" });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || "Unable to load doctors.");
                return;
            }

            setDoctors(Array.isArray(data.doctors) ? data.doctors : []);
        } catch {
            setError("Unable to load doctors. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadDoctors();
    }, [loadDoctors]);

    const updateField = (field: keyof DoctorFormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
        setSuccess("");
    };

    const toggleCapacityCategory = (category: string) => {
        setForm((prev) => ({
            ...prev,
            capacity_count_categories: prev.capacity_count_categories.includes(category)
                ? prev.capacity_count_categories.filter((item) => item !== category)
                : [...prev.capacity_count_categories, category],
        }));
        setFieldErrors((prev) => ({ ...prev, capacity_count_categories: undefined }));
        setSuccess("");
    };

    const toggleSitDay = (day: number) => {
        setForm((prev) => ({
            ...prev,
            sit_days: prev.sit_days.includes(day)
                ? prev.sit_days.filter((item) => item !== day)
                : [...prev.sit_days, day].sort((left, right) => left - right),
        }));
        setFieldErrors((prev) => ({ ...prev, sit_days: undefined }));
        setSuccess("");
    };

    const removeProfilePicture = () => {
        updateField("profile_pic_url", "");
        setFieldErrors((prev) => ({ ...prev, profile_pic_url: undefined }));
    };

    const startEdit = (doctor: HmsDoctor) => {
        setEditingDoctorId(doctor.doctor_id);
        setForm({
            doctor_name: doctor.doctor_name || "",
            email: doctor.email || "",
            room_no: doctor.room_no || "",
            daily_capacity: doctor.daily_capacity ? String(doctor.daily_capacity) : "100",
            capacity_count_categories: Array.isArray(doctor.capacity_count_categories) && doctor.capacity_count_categories.length ? doctor.capacity_count_categories : [...emptyForm.capacity_count_categories],
            sit_days: Array.isArray(doctor.sit_days) && doctor.sit_days.length ? doctor.sit_days : [...emptyForm.sit_days],
            phone: doctor.phone || "",
            specialization: doctor.specialization || "",
            registration_no: doctor.registration_no || "",
            education: doctor.education || "",
            profile_pic_url: doctor.profile_pic_url || "",
            active_from: toInputDate(doctor.active_from),
            active_to: toInputDate(doctor.active_to),
        });
        setFieldErrors({});
        setSuccess("");
        setError("");
    };

    const cancelEdit = () => {
        setEditingDoctorId(null);
        setForm(emptyForm);
        setFieldErrors({});
    };

    const uploadProfilePicture = async (file: File | null) => {
        if (!file) return;
        setUploadingProfile(true);
        setError("");
        setFieldErrors((prev) => ({ ...prev, profile_pic_url: undefined }));

        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/hms/hospital-admin/doctors/upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setFieldErrors((prev) => ({ ...prev, profile_pic_url: data.error || "Unable to upload profile photo." }));
                return;
            }
            updateField("profile_pic_url", data.url || "");
            setSuccess("Profile photo uploaded.");
        } catch {
            setFieldErrors((prev) => ({ ...prev, profile_pic_url: "Unable to upload profile photo. Check your connection and try again." }));
        } finally {
            setUploadingProfile(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSuccess("");
        setError("");
        setTemporaryPassword("");

        const nextErrors = validateForm(form);
        setFieldErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            setError("Please correct the highlighted fields.");
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch(editingDoctorId ? `/api/hms/hospital-admin/doctors/${editingDoctorId}` : "/api/hms/hospital-admin/doctors", {
                method: editingDoctorId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doctor_name: form.doctor_name.trim(),
                    email: form.email.trim(),
                    room_no: form.room_no.trim(),
                    daily_capacity: Number(form.daily_capacity),
                    capacity_count_categories: form.capacity_count_categories,
                    sit_days: form.sit_days,
                    phone: form.phone.trim() || null,
                    specialization: form.specialization.trim(),
                    registration_no: form.registration_no.trim() || null,
                    education: form.education.trim() || null,
                    profile_pic_url: form.profile_pic_url.trim() || null,
                    active_from: form.active_from,
                    active_to: form.active_to,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || "Unable to create doctor.");
                setFieldErrors(data.fieldErrors || {});
                return;
            }

            setDoctors((prev) => editingDoctorId
                ? prev.map((doctor) => doctor.doctor_id === editingDoctorId ? data.doctor : doctor)
                : [...prev, data.doctor]);
            setForm(emptyForm);
            setEditingDoctorId(null);
            setFieldErrors({});
            setTemporaryPassword(data.temporaryPassword || "");
            setSuccess(editingDoctorId ? "Doctor updated." : "Doctor created. Copy the temporary password now.");
        } catch {
            setError(`Unable to ${editingDoctorId ? "update" : "create"} doctor. Check your connection and try again.`);
        } finally {
            setSubmitting(false);
        }
    };

    const resetPassword = async (doctor: HmsDoctor) => {
        if (!doctor.user_id) {
            setError("Doctor login user is not linked.");
            return;
        }

        setError("");
        setSuccess("");
        setTemporaryPassword("");
        setCopiedPassword(false);
        setResettingUserId(doctor.user_id);

        try {
            const res = await fetch(`/api/hms/hospital-admin/users/${doctor.user_id}/reset-password`, {
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

    const deleteDoctor = async (doctor: HmsDoctor) => {
        setActingDoctorId(doctor.doctor_id);
        setError("");
        setSuccess("");
        try {
            const res = await fetch(`/api/hms/hospital-admin/doctors/${doctor.doctor_id}`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || "Unable to delete doctor.");
                return;
            }
            setDoctors((prev) => prev.filter((item) => item.doctor_id !== doctor.doctor_id));
            setSuccess("Doctor deleted.");
        } catch {
            setError("Unable to delete doctor. Check your connection and try again.");
        } finally {
            setActingDoctorId(null);
        }
    };

    const toggleDoctorStatus = async (doctor: HmsDoctor) => {
        const active = isDoctorCurrentlyActive(doctor);
        setActingDoctorId(doctor.doctor_id);
        setError("");
        setSuccess("");
        try {
            const res = await fetch(`/api/hms/hospital-admin/doctors/${doctor.doctor_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: active ? "DEACTIVATE" : "ACTIVATE", active_to: active ? null : reactivateActiveTo || null }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || "Unable to update doctor status.");
                return;
            }
            setDoctors((prev) => prev.map((item) => item.doctor_id === doctor.doctor_id ? data.doctor : item));
            setSuccess(active ? "Doctor deactivated." : "Doctor activated.");
        } catch {
            setError("Unable to update doctor status. Check your connection and try again.");
        } finally {
            setActingDoctorId(null);
        }
    };

    const runConfirmedAction = async () => {
        const action = confirmAction;
        setConfirmAction(null);
        if (!action) return;
        if (action.type === "TOGGLE" && !isDoctorCurrentlyActive(action.doctor) && !reactivateActiveTo) {
            setConfirmAction(action);
            setError("Set active to date before activating this doctor.");
            return;
        }
        if (action.type === "RESET") await resetPassword(action.doctor);
        if (action.type === "DELETE") await deleteDoctor(action.doctor);
        if (action.type === "TOGGLE") await toggleDoctorStatus(action.doctor);
    };

    return (
        <div className="w-full">
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hospital Admin</p>
                    <h1 className="mt-1 text-2xl font-bold text-gray-950 sm:text-3xl">Doctors</h1>
                </div>
                <button
                    type="button"
                    onClick={() => void loadDoctors()}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {error && <HmsStatusAlert tone="error" message={error} onDismiss={clearError} />}
            {success && <HmsStatusAlert tone="success" message={success} onDismiss={clearSuccess} />}

            {temporaryPassword && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl">
                        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Temporary Password</p>
                                <h2 className="mt-1 text-base font-semibold text-gray-950">Copy this password now</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setTemporaryPassword("")}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                aria-label="Close temporary password"
                            >
                                <X size={15} />
                            </button>
                        </div>
                        <div className="px-4 py-4">
                            <p className="mb-3 text-sm text-gray-600">
                                Share this with the doctor. It will not be shown again after you close this popup or refresh the page.
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-950">
                                    {temporaryPassword}
                                </code>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void navigator.clipboard.writeText(temporaryPassword);
                                        setCopiedPassword(true);
                                    }}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                                >
                                    {copiedPassword ? <Check size={15} /> : <Copy size={15} />}
                                    {copiedPassword ? "Copied" : "Copy"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {confirmAction && (
                <ConfirmModal
                    title={confirmTitle(confirmAction)}
                    message={confirmMessage(confirmAction)}
                    validTo={confirmAction.type === "TOGGLE" && !isDoctorCurrentlyActive(confirmAction.doctor) ? reactivateActiveTo : undefined}
                    onValidToChange={setReactivateActiveTo}
                    requireValidTo={confirmAction.type === "TOGGLE" && !isDoctorCurrentlyActive(confirmAction.doctor) && isExpiredByActiveTo(confirmAction.doctor)}
                    onCancel={() => setConfirmAction(null)}
                    onConfirm={() => void runConfirmedAction()}
                />
            )}

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 px-4 py-3">
                        <h2 className="text-sm font-semibold text-gray-950">Doctor List</h2>
                    </div>
                    {loading ? (
                        <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                            <Loader2 size={16} className="animate-spin" />
                            Loading doctors
                        </div>
                    ) : sortedDoctors.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-gray-500">No doctors created.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">Doctor</th>
                                        <th className="px-4 py-3 font-semibold">Room</th>
                                        <th className="px-4 py-3 font-semibold">Email</th>
                                        <th className="px-4 py-3 font-semibold">Max Capacity</th>
                                        <th className="px-4 py-3 font-semibold">Sit Days</th>
                                        <th className="px-4 py-3 font-semibold">Status</th>
                                        <th className="px-4 py-3 font-semibold">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedDoctors.map((doctor) => (
                                        <tr key={doctor.doctor_id} className="border-t border-gray-100">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
                                                        <Stethoscope size={16} />
                                                    </span>
                                                    <div>
                                                        <p className="font-semibold text-gray-950">
                                                            Dr. {doctor.doctor_name || `Doctor ${doctor.doctor_id}`}
                                                        </p>
                                                        <p className="text-xs text-gray-500">{doctor.specialization || "General"}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-700">{doctor.room_no || "-"}</td>
                                            <td className="px-4 py-3 text-gray-600">{doctor.email || "-"}</td>
                                            <td className="px-4 py-3 font-semibold text-gray-950">{doctor.daily_capacity ?? "-"}</td>
                                            <td className="px-4 py-3 text-gray-700">{sitDaysLabel(doctor.sit_days)}</td>
                                            <td className="px-4 py-3">
                                                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                                                    {isDoctorCurrentlyActive(doctor) ? "ACTIVE" : "INACTIVE"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <IconButton label="Edit" onClick={() => startEdit(doctor)} icon={<Pencil size={15} />} />
                                                    <IconButton
                                                        label={isDoctorCurrentlyActive(doctor) ? "Deactivate" : "Activate"}
                                                        onClick={() => { setReactivateActiveTo(""); setConfirmAction({ type: "TOGGLE", doctor }); }}
                                                        icon={isDoctorCurrentlyActive(doctor) ? <PowerOff size={15} /> : <Power size={15} />}
                                                        disabled={actingDoctorId === doctor.doctor_id}
                                                    />
                                                    <IconButton
                                                        label="Reset Password"
                                                        disabled={!doctor.user_id || resettingUserId === doctor.user_id}
                                                        onClick={() => setConfirmAction({ type: "RESET", doctor })}
                                                        icon={<KeyRound size={15} />}
                                                    />
                                                    <IconButton
                                                        label="Delete"
                                                        onClick={() => setConfirmAction({ type: "DELETE", doctor })}
                                                        icon={<Trash2 size={15} />}
                                                        danger
                                                        disabled={actingDoctorId === doctor.doctor_id}
                                                    />
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
                        <h2 className="text-sm font-semibold text-gray-950">{editingDoctorId ? "Edit Doctor" : "Create Doctor"}</h2>
                        {editingDoctorId ? (
                            <button type="button" onClick={cancelEdit} className="ml-auto text-xs font-semibold text-black underline">
                                Cancel edit
                            </button>
                        ) : null}
                    </div>

                    <div className="space-y-4">
                        <Field
                            label="Doctor Name"
                            required
                            value={form.doctor_name}
                            error={fieldErrors.doctor_name}
                            onChange={(value) => updateField("doctor_name", value)}
                        />
                        <Field
                            label="Email"
                            required
                            type="email"
                            value={form.email}
                            error={fieldErrors.email}
                            onChange={(value) => updateField("email", value)}
                        />
                        <Field
                            label="Room Number"
                            required
                            info="The room shown for this doctor on queues, slips, and staff screens."
                            value={form.room_no}
                            error={fieldErrors.room_no}
                            onChange={(value) => updateField("room_no", value)}
                        />
                        <Field
                            label="Daily Capacity"
                            required
                            info="How many patients this doctor normally sees in a day before extra charges may start."
                            type="number"
                            value={form.daily_capacity}
                            error={fieldErrors.daily_capacity}
                            onChange={(value) => updateField("daily_capacity", value)}
                        />
                        <div>
                            <label className="mb-2 block text-xs font-medium text-gray-600">
                                <HmsLabelWithInfo
                                    label="Capacity Categories *"
                                    info="Choose which types of patients should be counted in this doctor's daily limit. Cancelled visits are not counted."
                                />
                            </label>
                            <div className={`grid gap-2 rounded-lg border p-2 ${fieldErrors.capacity_count_categories ? "border-red-300" : "border-gray-200"}`}>
                                {capacityCategoryOptions.map((category) => (
                                    <label key={category} className="flex min-w-0 items-start gap-2 text-xs font-medium text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={form.capacity_count_categories.includes(category)}
                                            onChange={() => toggleCapacityCategory(category)}
                                            className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                                        />
                                        <span className="min-w-0 break-words leading-5">{category}</span>
                                    </label>
                                ))}
                            </div>
                            {fieldErrors.capacity_count_categories && <p className="mt-1 text-xs text-red-600">{fieldErrors.capacity_count_categories}</p>}
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-medium text-gray-600">
                                <HmsLabelWithInfo
                                    label="Doctor Sit Days *"
                                    info="Reception can register patients for this doctor only on these selected days, after hospital holidays and doctor leave are also checked."
                                />
                            </label>
                            <div className={`flex flex-wrap gap-2 rounded-lg border p-2 ${fieldErrors.sit_days ? "border-red-300" : "border-gray-200"}`}>
                                {weekdayOptions.map((day) => {
                                    const active = form.sit_days.includes(day.value);
                                    return (
                                        <button
                                            key={day.value}
                                            type="button"
                                            onClick={() => toggleSitDay(day.value)}
                                            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                                                active
                                                    ? "border-black bg-black text-white"
                                                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            {day.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {fieldErrors.sit_days && <p className="mt-1 text-xs text-red-600">{fieldErrors.sit_days}</p>}
                        </div>
                        <Field
                            label="Phone"
                            value={form.phone}
                            error={fieldErrors.phone}
                            onChange={(value) => updateField("phone", value)}
                        />
                        <Field
                            label="Specialization"
                            required
                            value={form.specialization}
                            error={fieldErrors.specialization}
                            onChange={(value) => updateField("specialization", value)}
                        />
                        <Field
                            label="Registration Number *"
                            value={form.registration_no}
                            error={fieldErrors.registration_no}
                            onChange={(value) => updateField("registration_no", value)}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field
                                label="Active From"
                                required
                                type="date"
                                value={form.active_from}
                                error={fieldErrors.active_from}
                                onChange={(value) => updateField("active_from", value)}
                            />
                            <Field
                                label="Active To"
                                required
                                type="date"
                                value={form.active_to}
                                error={fieldErrors.active_to}
                                onChange={(value) => updateField("active_to", value)}
                            />
                        </div>
                        <Field
                            label="Education"
                            value={form.education}
                            error={fieldErrors.education}
                            onChange={(value) => updateField("education", value)}
                        />
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">Profile Photo</label>
                            {form.profile_pic_url ? (
                                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-black px-3 py-2 text-sm font-semibold text-black">
                                    <span className="min-w-0 truncate" title={profilePhotoFileName(form.profile_pic_url)}>
                                        {profilePhotoFileName(form.profile_pic_url)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={removeProfilePicture}
                                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-black text-black hover:bg-black hover:text-white"
                                        aria-label="Remove profile photo"
                                        title="Remove profile photo"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : null}
                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-black px-3 py-2 text-sm font-semibold text-black hover:bg-black hover:text-white">
                                {uploadingProfile ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                                {uploadingProfile ? "Uploading photo" : form.profile_pic_url ? "Replace Profile Photo" : "Upload Profile Photo"}
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    disabled={uploadingProfile}
                                    onChange={(event) => {
                                        const file = event.target.files?.[0] ?? null;
                                        void uploadProfilePicture(file);
                                        event.target.value = "";
                                    }}
                                    className="sr-only"
                                />
                            </label>
                            {fieldErrors.profile_pic_url && <p className="mt-1 text-xs text-red-600">{fieldErrors.profile_pic_url}</p>}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        {editingDoctorId ? "Save Doctor" : "Create Doctor"}
                    </button>
                </form>
            </div>
        </div>
    );
}

function Field({
    label,
    info,
    required = false,
    value,
    error,
    type = "text",
    onChange,
}: {
    label: string;
    info?: string;
    required?: boolean;
    value: string;
    error?: string;
    type?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
                <HmsLabelWithInfo label={`${label}${required ? " *" : ""}`} info={info} />
            </label>
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
                danger
                    ? "border-red-700 text-red-700 hover:bg-red-700 hover:text-white"
                    : "border-black text-black hover:bg-black hover:text-white"
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
                        <span className="text-xs font-bold uppercase text-black">Active To{requireValidTo ? " *" : ""}</span>
                        <input
                            type="date"
                            value={validTo}
                            onChange={(event) => onValidToChange?.(event.target.value)}
                            className="w-full rounded-lg border border-black px-3 py-2 text-sm font-bold text-black outline-none"
                        />
                    </label>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="rounded-lg border border-black px-4 py-2 text-sm font-bold text-black hover:bg-black hover:text-white">
                        Cancel
                    </button>
                    <button type="button" onClick={onConfirm} className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white">
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}
