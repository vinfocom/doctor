"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Search, X } from "lucide-react";
import DoctorPrescriptionModal, { type PrescriptionModalTarget } from "@/components/DoctorPrescriptionModal";
import type {
    EmrClinicalHistoryPayload,
    EmrClinicalHistorySection,
} from "@/lib/emr";

interface Patient {
    patient_id: number;
    full_name: string;
    age: number | null;
    gender: string | null;
    phone: string | null;
    patient_type: string | null;
}

interface EmrHistoryItem {
    id: number;
    visit_date: string;
    status: "final";
    finalized_at: string | null;
    version_number: number;
    edit_reason: string | null;
    updated_at: string;
    follow_up_appointment: {
        appointment_id: number;
        date: string;
        slot_time: string;
        clinic_id: number | null;
        clinic_name: string | null;
    } | null;
    clinical_history: EmrClinicalHistoryPayload[];
}

interface EmrHistoryGroup {
    date: string;
    items: EmrHistoryItem[];
}

interface EmrHistoryPatientSummary {
    patient_id: number;
    full_name: string | null;
    age: number | null;
    gender: string | null;
    phone: string | null;
}

const CLINICAL_HISTORY_LABELS: Record<EmrClinicalHistorySection, string> = {
    examination_findings: "Examination Findings",
    investigation_findings: "Investigation Findings",
    past_medical_history: "Past Medical History",
    family_history: "Family History",
    surgical_history: "Surgical History",
    treatment_history: "Treatment History",
    allergies: "Allergies",
    personal_social_history: "Personal / Social History",
};

const CLINICAL_HISTORY_SECTIONS: EmrClinicalHistorySection[] = [
    "examination_findings",
    "investigation_findings",
    "past_medical_history",
    "family_history",
    "surgical_history",
    "treatment_history",
    "allergies",
    "personal_social_history",
];

function formatHistoryDate(value: string) {
    const date = new Date(`${value}T00:00:00+05:30`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    });
}

function formatHistoryTime(value: string | null | undefined) {
    if (!value) return "Time unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time unavailable";
    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
    });
}

function formatFollowUpSummary(
    summary: EmrHistoryItem["follow_up_appointment"]
) {
    if (!summary?.date || !summary.slot_time) return "";

    const formattedDate = new Date(`${summary.date}T12:00:00+05:30`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    });

    const [hours, minutes] = summary.slot_time.split(":").map(Number);
    const slotDate = new Date(Date.UTC(1970, 0, 1, hours || 0, minutes || 0));
    const formattedTime = slotDate.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
    }).toUpperCase();

    return [
        formattedDate,
        formattedTime,
        summary.clinic_name?.trim() ? summary.clinic_name.trim().toUpperCase() : null,
    ]
        .filter(Boolean)
        .join(" | ");
}

function getClinicalHistoryDetails(
    item: EmrHistoryItem,
    section: EmrClinicalHistorySection
) {
    return (item.clinical_history ?? [])
        .filter((entry) => entry.section === section)
        .map((entry) => entry.details.trim())
        .filter(Boolean);
}

export default function DoctorPatientsPage() {
    const router = useRouter();
    const [, setUser] = useState<{ name: string } | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [doctorId, setDoctorId] = useState<number | null>(null);
    const [emrPadEnabled, setEmrPadEnabled] = useState(false);
    const [prescriptionTarget, setPrescriptionTarget] = useState<PrescriptionModalTarget | null>(null);
    const [emrHistoryTarget, setEmrHistoryTarget] = useState<Patient | null>(null);
    const [emrHistoryPatient, setEmrHistoryPatient] = useState<EmrHistoryPatientSummary | null>(null);
    const [emrHistoryGroups, setEmrHistoryGroups] = useState<EmrHistoryGroup[]>([]);
    const [emrHistoryLoading, setEmrHistoryLoading] = useState(false);
    const [emrHistoryError, setEmrHistoryError] = useState("");

    const fetchData = useCallback(async () => {
        try {
            const [meRes, patRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/patients")]);
            if (!meRes.ok) {
                router.push("/login");
                return;
            }

            const meData = await meRes.json();
            if (meData.user.role !== "DOCTOR") {
                router.push("/login");
                return;
            }

            setUser(meData.user);
            setDoctorId(meData.user.doctor_id || meData.user.doctor?.doctor_id || null);
            setEmrPadEnabled(Boolean(meData.user.emr_prescription_enabled));

            if (patRes.ok) {
                const data = await patRes.json();
                setPatients(data.patients || []);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    }, [router]);

    const loadEmrHistory = useCallback(async (patient: Patient) => {
        setEmrHistoryTarget(patient);
        setEmrHistoryPatient(null);
        setEmrHistoryGroups([]);
        setEmrHistoryError("");
        setEmrHistoryLoading(true);

        try {
            const res = await fetch(`/api/emr/patients/${patient.patient_id}/history`, {
                cache: "no-store",
            });
            const data = await res.json() as {
                patient?: EmrHistoryPatientSummary;
                history?: EmrHistoryGroup[];
                error?: string;
            };

            if (!res.ok) {
                throw new Error(data.error || "Failed to load EMR prescription history");
            }

            setEmrHistoryPatient(data.patient ?? null);
            setEmrHistoryGroups(data.history ?? []);
        } catch (error) {
            setEmrHistoryError(
                error instanceof Error ? error.message : "Failed to load EMR prescription history"
            );
        } finally {
            setEmrHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!emrHistoryTarget) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [emrHistoryTarget]);

    const filteredPatients = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) {
            return patients;
        }

        const normalizedQueryPhone = query.replace(/\D/g, "");

        return patients.filter((patient) => {
            const normalizedName = String(patient.full_name || "").toLowerCase();
            const normalizedPhone = String(patient.phone || "").replace(/\D/g, "");

            return (
                normalizedName.includes(query) ||
                (normalizedQueryPhone.length > 0 && normalizedPhone.includes(normalizedQueryPhone))
            );
        });
    }, [patients, searchTerm]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                    <svg className="animate-spin h-10 w-10 text-indigo-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                </motion.div>
            </div>
        );
    }

        return (
        <div className="w-full">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">My Patients</h1>
                    <p className="text-gray-500 mt-1 text-sm">View details of your patients</p>
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="w-full sm:max-w-sm"
                >
                    <div className="relative">
                        <Search
                            size={16}
                            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Search by patient name or phone"
                            className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-11 text-sm text-gray-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                        {searchTerm ? (
                            <button
                                type="button"
                                onClick={() => setSearchTerm("")}
                                className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                aria-label="Clear patient search"
                                title="Clear"
                            >
                                <X size={15} />
                            </button>
                        ) : null}
                    </div>
                </motion.div>
            </div>

            <motion.div className="glass-card p-5 sm:p-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                {patients.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-4xl mb-3">Patients</p>
                        <p className="text-gray-400">No patients found</p>
                    </div>
                ) : filteredPatients.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-lg font-semibold text-gray-700">No matching patients</p>
                        <p className="mt-2 text-sm text-gray-400">Try searching by another name or phone number.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Patient</th>
                                    <th>Age</th>
                                    <th>Gender</th>
                                    <th>Phone</th>
                                    <th>Type</th>
                                    <th>Prescriptions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPatients.map((pat, i) => (
                                    <motion.tr key={pat.patient_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                                                    {pat.full_name?.charAt(0)?.toUpperCase() || "P"}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!doctorId) return;
                                                        setPrescriptionTarget({
                                                            patientId: pat.patient_id,
                                                            doctorId,
                                                            patientName: pat.full_name || "Patient",
                                                        });
                                                    }}
                                                    className="text-left text-indigo-700 hover:text-indigo-900 hover:underline font-medium"
                                                >
                                                    {pat.full_name || "N/A"}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="text-gray-500">{pat.age ? `${pat.age} yrs` : "N/A"}</td>
                                        <td className="text-gray-500">
                                            {pat.gender ? (pat.gender.charAt(0).toUpperCase() + pat.gender.slice(1).toLowerCase()) : "N/A"}
                                        </td>
                                        <td className="text-gray-500">{pat.phone || "N/A"}</td>
                                        <td>
                                            {pat.patient_type ? (
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                        pat.patient_type === "Other"
                                                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                                                            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                                    }`}
                                                >
                                                    {pat.patient_type}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 italic text-sm">Not specified</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!doctorId) return;
                                                        setPrescriptionTarget({
                                                            patientId: pat.patient_id,
                                                            doctorId,
                                                            patientName: pat.full_name || "Patient",
                                                        });
                                                    }}
                                                    className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                                >
                                                    Image
                                                </button>
                                                {emrPadEnabled ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void loadEmrHistory(pat)}
                                                        className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                                    >
                                                        EMR History
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>
            <DoctorPrescriptionModal
                isOpen={Boolean(prescriptionTarget)}
                onClose={() => setPrescriptionTarget(null)}
                target={prescriptionTarget}
                allowUpload
            />
            {emrHistoryTarget ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
                    <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">EMR Prescription History</h2>
                                <p className="mt-1 text-sm text-gray-500">
                                    Read-only structured prescriptions for {emrHistoryPatient?.full_name || emrHistoryTarget.full_name || "this patient"}
                                </p>
                                {emrHistoryPatient ? (
                                    <p className="mt-2 text-sm text-gray-600">
                                        {emrHistoryPatient.phone || "Phone unavailable"}
                                        {emrHistoryPatient.age ? ` • ${emrHistoryPatient.age} yrs` : ""}
                                        {emrHistoryPatient.gender ? ` • ${emrHistoryPatient.gender}` : ""}
                                    </p>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setEmrHistoryTarget(null);
                                    setEmrHistoryPatient(null);
                                    setEmrHistoryGroups([]);
                                    setEmrHistoryError("");
                                }}
                                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="max-h-[calc(88vh-96px)] overflow-y-auto px-6 py-5">
                            {emrHistoryLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <svg className="h-8 w-8 animate-spin text-indigo-500" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                </div>
                            ) : emrHistoryError ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-medium text-red-700">
                                    {emrHistoryError}
                                </div>
                            ) : emrHistoryGroups.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                                    No finalized structured prescriptions found for this patient yet.
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {emrHistoryGroups.map((group) => (
                                        <section key={group.date} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                                            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                                                {formatHistoryDate(group.date)}
                                            </h3>
                                            <div className="mt-3 space-y-3">
                                                {group.items
                                                    .slice()
                                                    .sort((left, right) => {
                                                        const leftTime = new Date(left.finalized_at ?? left.updated_at).getTime();
                                                        const rightTime = new Date(right.finalized_at ?? right.updated_at).getTime();
                                                        return leftTime - rightTime;
                                                    })
                                                    .map((item) => {
                                                        const followUpLabel = formatFollowUpSummary(item.follow_up_appointment);
                                                        const visibleClinicalHistorySections = CLINICAL_HISTORY_SECTIONS
                                                            .map((section) => ({
                                                                section,
                                                                details: getClinicalHistoryDetails(item, section),
                                                            }))
                                                            .filter((entry) => entry.details.length > 0);

                                                        return (
                                                        <div
                                                            key={item.id}
                                                            className="rounded-2xl border border-indigo-100 bg-white px-4 py-4"
                                                        >
                                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                                <div>
                                                                    <p className="text-sm font-semibold text-gray-900">
                                                                        Final Prescription • Version {item.version_number}
                                                                    </p>
                                                                    <p className="mt-1 text-xs text-gray-500">
                                                                        Finalized {formatHistoryTime(item.finalized_at ?? item.updated_at)}
                                                                    </p>
                                                                    {item.edit_reason ? (
                                                                        <p className="mt-2 text-xs text-amber-700">
                                                                            Reason: {item.edit_reason}
                                                                        </p>
                                                                    ) : null}
                                                                    {followUpLabel ? (
                                                                        <p className="mt-2 text-xs font-medium text-indigo-700">
                                                                            Follow-up {followUpLabel}
                                                                        </p>
                                                                    ) : null}
                                                                    {visibleClinicalHistorySections.length > 0 ? (
                                                                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                                            {visibleClinicalHistorySections.map(({ section, details }) => (
                                                                                <div
                                                                                    key={`${item.id}-${section}`}
                                                                                    className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                                                                                >
                                                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                                                                        {CLINICAL_HISTORY_LABELS[section]}
                                                                                    </p>
                                                                                    <p className="mt-1 text-xs text-gray-700">
                                                                                        {details.join(", ")}
                                                                                    </p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <Link
                                                                        href={`/dashboard/doctor/prescriptions/${item.id}/print?from=patients`}
                                                                        className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                                                    >
                                                                        View
                                                                    </Link>
                                                                    <Link
                                                                        href={`/dashboard/doctor/prescriptions/${item.id}/print?from=patients`}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                                                    >
                                                                        Print
                                                                    </Link>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        );
                                                    })}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
