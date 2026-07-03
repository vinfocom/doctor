"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { AlertTriangle, Building2, MapPin, Phone, Stethoscope, Users, ArrowRight, BriefcaseMedical, Save, X, ChevronDown } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

type DoctorSummary = {
    doctor_id: number;
    doctor_name: string | null;
    profile_pic_url: string | null;
    specialization: string | null;
    status: string | null;
};

type ClinicSummary = {
    clinic_id: number;
    clinic_name: string | null;
    location: string | null;
    phone: string | null;
    status: string | null;
    doctor_id: number | null;
    created_at: string | null;
    hospital_group_code: string | null;
    doctor: DoctorSummary | null;
};

type StaffSummary = {
    staff_id: number;
    name: string | null;
    email: string | null;
    role: string;
    status: string;
    clinic_id: number | null;
    clinic_name: string | null;
    assigned_doctor_ids: number[];
};

type HospitalGroup = {
    hospital_group_code: string;
    display_name: string;
    clinics: ClinicSummary[];
    doctors: DoctorSummary[];
    staff: StaffSummary[];
    warnings?: string[];
};

type SectionKey = "hospitalList";

export default function AdminHospitalsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedGroup = searchParams.get("group") || "";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [hospitals, setHospitals] = useState<HospitalGroup[]>([]);
    const [selectedGroupCode, setSelectedGroupCode] = useState("");
    const [editingStaffId, setEditingStaffId] = useState<number | null>(null);
    const [selectedDoctorIds, setSelectedDoctorIds] = useState<number[]>([]);
    const [savingStaffAssignment, setSavingStaffAssignment] = useState(false);
    const [staffAssignmentError, setStaffAssignmentError] = useState("");
    const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
        hospitalList: true,
    });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const [meRes, hospitalsRes] = await Promise.all([
                fetch("/api/auth/me", { cache: "no-store" }),
                fetch("/api/admin/hospitals", { cache: "no-store" }),
            ]);

            if (!meRes.ok) {
                router.push("/login");
                return;
            }

            const meData = await meRes.json();
            if (meData.user.role !== "SUPER_ADMIN" && meData.user.role !== "ADMIN") {
                router.push("/login");
                return;
            }

            if (!hospitalsRes.ok) {
                const body = await hospitalsRes.json().catch(() => null);
                throw new Error(body?.error || "Failed to load hospitals.");
            }

            const data = await hospitalsRes.json();
            const nextHospitals = Array.isArray(data.hospitals) ? data.hospitals : [];
            setHospitals(nextHospitals);

            const initialGroup =
                nextHospitals.find((item: HospitalGroup) => item.hospital_group_code === requestedGroup)?.hospital_group_code ||
                nextHospitals[0]?.hospital_group_code ||
                "";
            setSelectedGroupCode(initialGroup);
        } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : "Failed to load hospitals.");
        } finally {
            setLoading(false);
        }
    }, [requestedGroup, router]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!requestedGroup) return;
        setSelectedGroupCode(requestedGroup);
    }, [requestedGroup]);

    const selectedHospital = useMemo(
        () => hospitals.find((hospital) => hospital.hospital_group_code === selectedGroupCode) || null,
        [hospitals, selectedGroupCode]
    );

    const stats = useMemo(() => ({
        hospitals: hospitals.length,
        clinics: hospitals.reduce((sum, hospital) => sum + hospital.clinics.length, 0),
        doctors: hospitals.reduce((sum, hospital) => sum + hospital.doctors.length, 0),
        staff: hospitals.reduce((sum, hospital) => sum + hospital.staff.length, 0),
    }), [hospitals]);

    const startStaffAssignment = (staff: StaffSummary) => {
        setEditingStaffId(staff.staff_id);
        setSelectedDoctorIds(staff.assigned_doctor_ids);
        setStaffAssignmentError("");
    };

    const toggleDoctorAssignment = (doctorId: number) => {
        setSelectedDoctorIds((current) =>
            current.includes(doctorId)
                ? current.filter((id) => id !== doctorId)
                : [...current, doctorId]
        );
    };

    const saveStaffAssignment = async () => {
        if (!selectedHospital || !editingStaffId) return;
        if (selectedDoctorIds.length === 0) {
            setStaffAssignmentError("Select at least one doctor.");
            return;
        }

        try {
            setSavingStaffAssignment(true);
            setStaffAssignmentError("");

            const res = await fetch("/api/admin/hospitals", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "assign_staff_doctors",
                    hospital_group_code: selectedHospital.hospital_group_code,
                    staff_id: editingStaffId,
                    doctor_ids: selectedDoctorIds,
                }),
            });

            const body = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(body?.error || "Failed to update staff doctors.");
            }

            setEditingStaffId(null);
            setSelectedDoctorIds([]);
            await fetchData();
        } catch (caughtError) {
            setStaffAssignmentError(caughtError instanceof Error ? caughtError.message : "Failed to update staff doctors.");
        } finally {
            setSavingStaffAssignment(false);
        }
    };

    const toggleSection = (section: SectionKey) => {
        setOpenSections((current) => ({
            ...current,
            [section]: !current[section],
        }));
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            </div>
        );
    }

    return (
        <div className="w-full">
            <motion.div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Hospitals</h1>
                    <p className="mt-1 text-sm text-gray-500">Grouped hospital view built from clinic group codes.</p>
                </div>
                <Link
                    href="/dashboard/admin/clinics"
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                >
                    Manage Grouping
                    <ArrowRight size={16} />
                </Link>
            </motion.div>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: "Hospital Groups", value: stats.hospitals, icon: <Building2 className="h-5 w-5 text-indigo-600" /> },
                    { label: "Grouped Clinics", value: stats.clinics, icon: <BriefcaseMedical className="h-5 w-5 text-emerald-600" /> },
                    { label: "Doctors", value: stats.doctors, icon: <Stethoscope className="h-5 w-5 text-sky-600" /> },
                    { label: "Staff", value: stats.staff, icon: <Users className="h-5 w-5 text-amber-600" /> },
                ].map((stat) => (
                    <GlassCard key={stat.label} className="flex items-center gap-4 px-5 py-4">
                        <div className="rounded-xl bg-gray-50 p-3">{stat.icon}</div>
                        <div>
                            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                            <div className="text-xs font-medium text-gray-500">{stat.label}</div>
                        </div>
                    </GlassCard>
                ))}
            </div>

            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            ) : null}

            {!error && hospitals.length === 0 ? (
                <GlassCard className="px-6 py-10 text-center">
                    <Building2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <h2 className="text-lg font-semibold text-gray-800">No hospital groups yet</h2>
                    <p className="mt-2 text-sm text-gray-500">Assign the same hospital group code to related clinics from Clinic Management.</p>
                </GlassCard>
            ) : null}

            {!error && hospitals.length > 0 ? (
                <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                    <GlassCard className="h-fit px-0 py-0">
                        <button
                            type="button"
                            onClick={() => toggleSection("hospitalList")}
                            className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 text-left"
                        >
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Hospital Groups</h2>
                                <p className="mt-1 text-xs text-gray-500">{hospitals.length} total groups</p>
                            </div>
                            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${openSections.hospitalList ? "rotate-180" : ""}`} />
                        </button>
                        {openSections.hospitalList ? (
                            <div className="max-h-[72vh] overflow-y-auto p-3">
                                <div className="space-y-2">
                                    {hospitals.map((hospital, index) => {
                                        const selected = hospital.hospital_group_code === selectedGroupCode;
                                        return (
                                            <motion.button
                                                key={hospital.hospital_group_code}
                                                type="button"
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.03 }}
                                                onClick={() => setSelectedGroupCode(hospital.hospital_group_code)}
                                                className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                                                    selected
                                                        ? "border-indigo-300 bg-indigo-50 shadow-sm"
                                                        : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40"
                                                }`}
                                            >
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-bold text-gray-900">{hospital.display_name}</div>
                                                    <div className="mt-1 truncate text-[11px] font-medium tracking-wide text-gray-400">
                                                        {hospital.hospital_group_code}
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                                                    <span className="rounded-lg bg-white/90 px-2.5 py-1 font-semibold text-gray-700">
                                                        {hospital.clinics.length} clinics
                                                    </span>
                                                    <span className="rounded-lg bg-white/90 px-2.5 py-1 font-semibold text-gray-700">
                                                        {hospital.doctors.length} doctors
                                                    </span>
                                                    <span className="rounded-lg bg-white/90 px-2.5 py-1 font-semibold text-gray-700">
                                                        {hospital.staff.length} staff
                                                    </span>
                                                    <span className="rounded-lg bg-white/90 px-2.5 py-1 font-semibold text-gray-700">
                                                        {hospital.clinics.filter((clinic) => clinic.status === "ACTIVE").length} active
                                                    </span>
                                                    {hospital.warnings?.length ? (
                                                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                                                            <AlertTriangle size={12} />
                                                            Check
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}
                    </GlassCard>

                    <div className="space-y-6">
                        {selectedHospital ? (
                            <>
                                <GlassCard className="px-6 py-5">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900">{selectedHospital.display_name}</h2>
                                            <p className="mt-1 text-sm text-gray-500">Hospital group code: <span className="font-semibold text-gray-700">{selectedHospital.hospital_group_code}</span></p>
                                            {selectedHospital.warnings?.length ? (
                                                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                                    <div className="mb-1 flex items-center gap-2 font-semibold">
                                                        <AlertTriangle size={15} />
                                                        Check hospital grouping
                                                    </div>
                                                    <div className="space-y-1 text-xs font-medium">
                                                        {selectedHospital.warnings.map((warning) => (
                                                            <div key={warning}>{warning}</div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600">{selectedHospital.clinics.length} clinics</span>
                                            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600">{selectedHospital.doctors.length} doctors</span>
                                            <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-600">{selectedHospital.staff.length} staff</span>
                                        </div>
                                    </div>
                                </GlassCard>

                                <GlassCard className="px-6 py-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-base font-bold text-gray-900">Clinics In This Hospital</h3>
                                        <span className="text-sm font-medium text-gray-500">{selectedHospital.clinics.length}</span>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        {selectedHospital.clinics.map((clinic) => (
                                            <div key={clinic.clinic_id} className="rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-4">
                                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                    <div>
                                                        <div className="font-semibold text-gray-900">{clinic.clinic_name || `Clinic ${clinic.clinic_id}`}</div>
                                                        <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
                                                            <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{clinic.location || "No location"}</span>
                                                            <span className="inline-flex items-center gap-1.5"><Phone size={14} />{clinic.phone || "No phone"}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-gray-500 lg:text-right">
                                                        <div className="font-medium text-gray-800">{clinic.doctor?.doctor_name ? `Dr. ${clinic.doctor.doctor_name}` : "Unassigned doctor"}</div>
                                                        <div className="mt-1">{clinic.status || "Unknown status"}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </GlassCard>

                                <div className="grid gap-6 lg:grid-cols-2">
                                    <GlassCard className="px-6 py-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 className="text-base font-bold text-gray-900">Doctors</h3>
                                            <span className="text-sm font-medium text-gray-500">{selectedHospital.doctors.length}</span>
                                        </div>
                                        <div className="mt-4 space-y-3">
                                            {selectedHospital.doctors.map((doctor) => (
                                                <div key={doctor.doctor_id} className="rounded-2xl border border-gray-100 bg-white px-4 py-4">
                                                    <div className="font-semibold text-gray-900">Dr. {doctor.doctor_name || "Doctor"}</div>
                                                    <div className="mt-1 text-sm text-gray-500">{doctor.specialization || "Specialization not set"}</div>
                                                    <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{doctor.status || "Active"}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </GlassCard>

                                    <GlassCard className="px-6 py-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 className="text-base font-bold text-gray-900">Associated Staff</h3>
                                            <span className="text-sm font-medium text-gray-500">{selectedHospital.staff.length}</span>
                                        </div>
                                        <div className="mt-4 space-y-3">
                                            {selectedHospital.staff.length === 0 ? (
                                                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
                                                    No staff linked to the doctors in this hospital group yet.
                                                </div>
                                            ) : selectedHospital.staff.map((staff) => (
                                                <div key={staff.staff_id} className="rounded-2xl border border-gray-100 bg-white px-4 py-4">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <div className="font-semibold text-gray-900">{staff.name || "Clinic Staff"}</div>
                                                                <div className="mt-1 text-sm text-gray-500">{staff.email || "No email"}</div>
                                                            </div>
                                                            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${staff.status === "ACTIVE" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                                                                {staff.status}
                                                            </span>
                                                        </div>
                                                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                                            <span className="rounded-lg bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-600">{staff.role}</span>
                                                            <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-semibold text-gray-600">
                                                                {staff.assigned_doctor_ids.length} assigned doctors
                                                            </span>
                                                            <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-semibold text-gray-600">
                                                                {staff.clinic_name || "All clinics"}
                                                            </span>
                                                        </div>
                                                        <div className="mt-3">
                                                            {editingStaffId === staff.staff_id ? (
                                                                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
                                                                    <div className="mb-3 flex items-center justify-between gap-3">
                                                                        <div className="text-sm font-semibold text-gray-900">Assign Doctors</div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingStaffId(null);
                                                                                setSelectedDoctorIds([]);
                                                                                setStaffAssignmentError("");
                                                                            }}
                                                                            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-white hover:text-gray-700"
                                                                            aria-label="Cancel assignment"
                                                                        >
                                                                            <X size={16} />
                                                                        </button>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        {selectedHospital.doctors.map((doctor) => (
                                                                            <label key={doctor.doctor_id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={selectedDoctorIds.includes(doctor.doctor_id)}
                                                                                    onChange={() => toggleDoctorAssignment(doctor.doctor_id)}
                                                                                    className="h-4 w-4 accent-indigo-600"
                                                                                />
                                                                                <span className="min-w-0 flex-1">
                                                                                    <span className="block truncate font-semibold text-gray-900">Dr. {doctor.doctor_name || "Doctor"}</span>
                                                                                    <span className="block truncate text-xs text-gray-500">{doctor.specialization || "Specialization not set"}</span>
                                                                                </span>
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                    {staffAssignmentError ? (
                                                                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                                                                            {staffAssignmentError}
                                                                        </div>
                                                                    ) : null}
                                                                    <button
                                                                        type="button"
                                                                        onClick={saveStaffAssignment}
                                                                        disabled={savingStaffAssignment}
                                                                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    >
                                                                        <Save size={15} />
                                                                        {savingStaffAssignment ? "Saving..." : "Save Doctor Assignment"}
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startStaffAssignment(staff)}
                                                                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
                                                                >
                                                                    Assign Doctors
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </GlassCard>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
