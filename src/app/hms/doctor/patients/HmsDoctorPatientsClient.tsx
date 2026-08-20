"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, FileText, Loader2, RefreshCw, Search, X } from "lucide-react";

type Patient = {
    patient_id: number;
    full_name: string | null;
    uhid: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
    city: string | null;
    location: string | null;
    last_visit_date: string | null;
    last_emr_visit_id: number | null;
    visit_count: number;
};

function patientLabel(patient: Pick<Patient, "full_name" | "patient_id" | "age" | "gender">) {
    const ageSex = [patient.age ?? null, patient.gender ? patient.gender.slice(0, 1).toUpperCase() : null].filter(Boolean).join("/");
    return `${patient.full_name || `Patient ${patient.patient_id}`}${ageSex ? ` (${ageSex})` : ""}`;
}

function emrWindowName(patient: Patient) {
    const name = String(patient.full_name || "Patient").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Patient";
    return `Rx-${name}`;
}

type PaginationState = {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
};

export default function HmsDoctorPatientsClient() {
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [pagination, setPagination] = useState<PaginationState>({
        page: 1,
        page_size: 25,
        total: 0,
        total_pages: 1,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const sortedPatients = useMemo(() => patients, [patients]);
    const counts = useMemo(() => ({
        total: pagination.total,
        withEmr: patients.filter((patient) => patient.last_emr_visit_id).length,
        listed: patients.length,
    }), [pagination.total, patients]);

    const loadPatients = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const params = new URLSearchParams();
            if (query.trim()) params.set("q", query.trim());
            params.set("page", String(page));
            params.set("page_size", "25");
            const response = await fetch(`/api/hms/doctor/patients?${params.toString()}`, { cache: "no-store" });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to load patients.");
                return;
            }

            setPatients(Array.isArray(data.patients) ? data.patients : []);
            if (data.pagination) {
                setPagination(data.pagination);
            }
        } catch {
            setError("Unable to load patients. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, [page, query]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadPatients();
        }, 250);

        return () => window.clearTimeout(timer);
    }, [loadPatients]);

    useEffect(() => {
        setPage(1);
    }, [query]);

    return (
        <div className="w-full">
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-black">Doctor</p>
                    <h1 className="mt-1 text-2xl font-bold text-black sm:text-3xl">Patients</h1>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                    <button
                        type="button"
                        onClick={() => void loadPatients()}
                        disabled={loading}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-black px-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
                    >
                        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-600 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle size={17} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Metric label="Patients" value={counts.total} />
                <Metric label="With EMR" value={counts.withEmr} />
                <Metric label="Listed" value={counts.listed} />
            </div>

            <div className="mb-4 flex items-center gap-2 rounded-lg border border-black bg-white px-3 py-2">
                <Search size={17} className="text-black" />
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search UHID, OPD, name, phone"
                    className="w-full border-0 bg-transparent text-sm text-black outline-none"
                />
                {query && (
                    <button type="button" onClick={() => setQuery("")} className="rounded p-1 text-black hover:bg-black hover:text-white" aria-label="Clear search">
                        <X size={16} />
                    </button>
                )}
            </div>

            <div className="overflow-hidden rounded-lg border border-black bg-white">
                <div className="flex items-center justify-between border-b border-black px-4 py-3">
                    <h2 className="text-sm font-semibold text-black">Patient Records</h2>
                    {loading && sortedPatients.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-black">
                            <Loader2 size={13} className="animate-spin" />
                            Refreshing
                        </span>
                    )}
                </div>
                {loading && sortedPatients.length === 0 ? (
                    <div className="flex min-h-40 items-center gap-2 px-4 py-6 text-sm text-black">
                        <Loader2 size={16} className="animate-spin" />
                        Loading patients
                    </div>
                ) : sortedPatients.length === 0 ? (
                    <div className="min-h-40 px-4 py-6 text-sm text-black">No patients found.</div>
                ) : (
                    <div className="max-h-[72vh] overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white text-xs uppercase tracking-wide text-black">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Patient</th>
                                    <th className="px-4 py-3 font-semibold">UHID</th>
                                    <th className="px-4 py-3 font-semibold">Phone</th>
                                    <th className="px-4 py-3 font-semibold">Visits</th>
                                    <th className="px-4 py-3 font-semibold">Last Visit</th>
                                    <th className="px-4 py-3 font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedPatients.map((patient) => (
                                    <tr key={patient.patient_id} className="border-t border-black">
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-black">{patientLabel(patient)}</p>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-black">{patient.uhid || "-"}</td>
                                        <td className="px-4 py-3 text-black">{patient.phone || "-"}</td>
                                        <td className="px-4 py-3 font-semibold text-black">{patient.visit_count}</td>
                                        <td className="px-4 py-3 text-black">{patient.last_visit_date || "-"}</td>
                                        <td className="px-4 py-3">
                                            {patient.last_emr_visit_id ? (
                                                <a href={`/hms/doctor/visits/${patient.last_emr_visit_id}?source=patients`} target={emrWindowName(patient)} className="inline-flex items-center gap-1 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">
                                                    <FileText size={13} />
                                                    Past EMR
                                                </a>
                                            ) : (
                                                <span className="text-xs font-medium text-black">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <PaginationControls
                page={pagination.page}
                totalPages={pagination.total_pages}
                total={pagination.total}
                onPageChange={setPage}
            />
        </div>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-black bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-black">{label}</p>
            <p className="mt-1 text-2xl font-bold text-black">{value}</p>
        </div>
    );
}

function PaginationControls({ page, totalPages, total, onPageChange }: { page: number; totalPages: number; total: number; onPageChange: (page: number) => void }) {
    if (totalPages <= 1 && total <= 0) return null;

    return (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-black bg-white px-4 py-3 text-sm text-black">
            <span className="font-semibold">{total} total</span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-black px-3 py-1.5 font-semibold text-black hover:bg-black hover:text-white disabled:opacity-40"
                >
                    Previous
                </button>
                <span className="min-w-24 text-center font-semibold">Page {page} / {Math.max(1, totalPages)}</span>
                <button
                    type="button"
                    onClick={() => onPageChange(Math.min(Math.max(1, totalPages), page + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg border border-black px-3 py-1.5 font-semibold text-black hover:bg-black hover:text-white disabled:opacity-40"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
