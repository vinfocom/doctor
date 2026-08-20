"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Printer, RefreshCw, UserRound, X } from "lucide-react";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

type DoctorVisit = {
    visit_id: number;
    visit_number: string | null;
    daily_token_number: number | null;
    visit_date: string;
    visit_type: string;
    status: string;
    finalized_prescription_id?: number | null;
    patient: {
        patient_id: number;
        full_name: string | null;
        uhid: string | null;
        phone: string | null;
        age: number | null;
        gender: string | null;
        last_emr_visit_id?: number | null;
    };
};

type VisitDetail = DoctorVisit & {
    fee_charged: number;
    payment_mode: string;
    payment_status: string;
    fee_waived_reason: string | null;
    created_at: string | null;
    started_at: string | null;
    finalized_at: string | null;
    patient: DoctorVisit["patient"] & {
        city: string | null;
        location: string | null;
        address: string | null;
    };
    doctor: {
        doctor_id: number;
        doctor_name: string | null;
        room_no: string | null;
    };
};

type PrescriptionSummary = {
    id: number;
    doctor_name: string | null;
    visit_date: string | null;
    status: string;
    finalized_at: string | null;
    referring_prescription_id: number | null;
};

type PrintEventSummary = {
    event_id: number;
    print_type: string;
    start_offset_mm: number;
    rendered_height_mm: number | null;
    created_at: string | null;
};

type VisitsResponse = {
    date: string;
    visits: DoctorVisit[];
    pagination?: {
        page: number;
        page_size: number;
        total: number;
        total_pages: number;
    };
    totals?: {
        waiting: number;
        inConsult: number;
        lab: number;
    };
};

type DetailResponse = {
    featureFlags?: {
        shared_paper_print_mode?: boolean;
        referral_followup_waivers?: boolean;
        emr_module?: boolean;
    };
    visit?: VisitDetail;
    prescriptions?: PrescriptionSummary[];
    printEvents?: PrintEventSummary[];
    error?: string;
};

function todayYmd() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function statusClass(status: string) {
    if (status === "WAITING") return "border border-black bg-white text-black";
    if (status === "IN_CONSULT") return "bg-black text-white";
    if (status === "LAB") return "bg-amber-100 text-amber-800";
    if (status === "COMPLETED") return "bg-emerald-100 text-emerald-800";
    return "bg-red-100 text-red-700";
}

function displayPatient(visit: Pick<DoctorVisit, "patient">) {
    const ageSex = [visit.patient.age ?? null, visit.patient.gender ? visit.patient.gender.slice(0, 1).toUpperCase() : null].filter(Boolean).join("/");
    return `${visit.patient.full_name || `Patient ${visit.patient.patient_id}`}${ageSex ? ` (${ageSex})` : ""}`;
}

function emrWindowName(visit: DoctorVisit) {
    const name = String(visit.patient.full_name || "Patient").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Patient";
    return `Rx-${name}`;
}

function currentVisitEmrHref(visit: DoctorVisit) {
    const query = visit.status === "LAB" ? "?resumeLab=1" : "";
    return `/hms/doctor/visits/${visit.visit_id}${query}`;
}

function isVisitDetail(visit: DoctorVisit | VisitDetail): visit is VisitDetail {
    return "fee_charged" in visit && "payment_status" in visit && "payment_mode" in visit;
}

export default function HmsDoctorQueueClient({
    defaultPrintEnabled = false,
    defaultEmrEnabled = true,
    mode = "queue",
}: {
    defaultPrintEnabled?: boolean;
    defaultEmrEnabled?: boolean;
    mode?: "queue" | "visits";
}) {
    const [visitDate, setVisitDate] = useState(todayYmd());
    const [visits, setVisits] = useState<DoctorVisit[]>([]);
    const [visitPage, setVisitPage] = useState(1);
    const [searchInput, setSearchInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [pagination, setPagination] = useState({ page: 1, page_size: 25, total: 0, total_pages: 1 });
    const [totals, setTotals] = useState({ waiting: 0, inConsult: 0, lab: 0 });
    const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
    const [detail, setDetail] = useState<DetailResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [actingVisitId, setActingVisitId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const clearError = useCallback(() => setError(""), []);
    const clearSuccess = useCallback(() => setSuccess(""), []);

    const printEnabled = detail?.featureFlags?.shared_paper_print_mode ?? defaultPrintEnabled;
    const emrEnabled = detail?.featureFlags?.emr_module ?? defaultEmrEnabled;
    const activeVisit = detail?.visit || visits.find((visit) => visit.visit_id === selectedVisitId) || null;
    const visibleVisits = useMemo(
        () => mode === "queue" ? visits.filter((visit) => visit.status === "WAITING" || visit.status === "IN_CONSULT") : visits,
        [mode, visits]
    );

    useHmsAutoDismissMessage(error, clearError, 7500);
    useHmsAutoDismissMessage(success, clearSuccess, 5000);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearchQuery(searchInput.trim());
        }, 250);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const loadVisits = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const params = new URLSearchParams({ date: visitDate });
            params.set("page", mode === "queue" ? "1" : String(visitPage));
            params.set("page_size", mode === "queue" ? "200" : "25");
            if (searchQuery) params.set("q", searchQuery);
            if (mode === "queue") params.set("active_only", "1");
            const response = await fetch(`/api/hms/doctor/visits?${params.toString()}`, { cache: "no-store" });
            const data = await response.json().catch(() => ({})) as Partial<VisitsResponse> & { error?: string };
            if (!response.ok) {
                setError(data.error || "Unable to load visits.");
                return;
            }

            const nextVisits = Array.isArray(data.visits) ? data.visits : [];
            if (data.pagination) setPagination(data.pagination);
            if (data.totals) setTotals(data.totals);
            const nextVisibleVisits = mode === "queue"
                ? nextVisits.filter((visit) => visit.status === "WAITING" || visit.status === "IN_CONSULT")
                : nextVisits;
            setVisits(nextVisits);
            setSelectedVisitId((current) => current && nextVisibleVisits.some((visit) => visit.visit_id === current)
                ? current
                : nextVisibleVisits[0]?.visit_id || null);
        } catch {
            setError("Unable to load visits. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, [mode, searchQuery, visitDate, visitPage]);

    const loadDetail = useCallback(async (visitId: number | null) => {
        if (!visitId) {
            setDetail(null);
            return;
        }

        setDetailLoading(true);
        try {
            const response = await fetch(`/api/hms/doctor/visits/${visitId}`, { cache: "no-store" });
            const data = await response.json().catch(() => ({})) as DetailResponse;

            if (!response.ok) {
                setError(data.error || "Unable to load visit details.");
                setDetail(null);
                return;
            }

            setDetail(data);
        } catch {
            setError("Unable to load visit details. Check your connection and try again.");
            setDetail(null);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadVisits();
        const interval = window.setInterval(() => void loadVisits(), 15000);
        return () => window.clearInterval(interval);
    }, [loadVisits]);

    useEffect(() => {
        setVisitPage(1);
    }, [searchQuery, visitDate, mode]);

    useEffect(() => {
        if (mode !== "queue") {
            setDetail(null);
            return;
        }
        void loadDetail(selectedVisitId);
    }, [loadDetail, mode, selectedVisitId]);

    const updateStatus = async (visit: DoctorVisit, status: "IN_CONSULT" | "COMPLETED" | "LAB") => {
        setError("");
        setSuccess("");
        setActingVisitId(visit.visit_id);

        try {
            const response = await fetch(`/api/hms/doctor/visits/${visit.visit_id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to update visit.");
                return;
            }

            setSuccess(`Visit moved to ${status}.`);
            await loadVisits();
            await loadDetail(visit.visit_id);
        } catch {
            setError("Unable to update visit. Check your connection and try again.");
        } finally {
            setActingVisitId(null);
        }
    };

    const counts = totals;

    return (
        <div className="w-full">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-black">Doctor</p>
                    <h1 className="mt-1 text-2xl font-bold text-black sm:text-3xl">{mode === "queue" ? "Queue" : "Visits"}</h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="relative min-w-[260px] flex-1 sm:flex-none">
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            placeholder="Search OPD, UHID, patient, type, status"
                            className="w-full rounded-lg border border-black px-3 py-2 pr-9 text-sm text-black outline-none placeholder:text-black focus:border-black focus:ring-2 focus:ring-black/10"
                        />
                        {searchInput && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchInput("");
                                    setSearchQuery("");
                                }}
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full border border-black bg-white p-1 text-black hover:bg-black hover:text-white"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                    <input
                        type="date"
                        value={visitDate}
                        onChange={(event) => setVisitDate(event.target.value)}
                        className="rounded-lg border border-black px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                    />
                    <button
                        type="button"
                        onClick={() => void loadVisits()}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
                    >
                        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && <HmsStatusAlert tone="error" message={error} onDismiss={clearError} />}
            {success && <HmsStatusAlert tone="success" message={success} onDismiss={clearSuccess} />}

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <Metric label="Waiting" value={counts.waiting} />
                <Metric label="In Consult" value={counts.inConsult} />
                <Metric label="Lab" value={counts.lab} />
            </div>

            <div className={mode === "queue" ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]" : "grid gap-5"}>
                <div className="rounded-lg border border-black bg-white">
                    <div className="flex items-center justify-between border-b border-black px-4 py-3">
                        <h2 className="text-sm font-semibold text-black">{mode === "queue" ? "Active Queue" : "Date-wise Visits"}</h2>
                        {loading && visibleVisits.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-black">
                                <Loader2 size={13} className="animate-spin" />
                                Refreshing
                            </span>
                        )}
                    </div>

                    {loading && visibleVisits.length === 0 ? (
                        <div className="flex min-h-40 items-center gap-2 px-4 py-6 text-sm text-black">
                            <Loader2 size={16} className="animate-spin" />
                            Loading visits
                        </div>
                    ) : visibleVisits.length === 0 ? (
                        <div className="min-h-40 px-4 py-6 text-sm text-black">{searchQuery ? "No visits match this search." : mode === "queue" ? "No active queue visits." : "No visits found."}</div>
                    ) : (
                        <div className={`${mode === "queue" ? "max-h-[72vh]" : "max-h-[78vh]"} overflow-auto`}>
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white text-xs uppercase tracking-wide text-black">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">Token</th>
                                        <th className="px-4 py-3 font-semibold">OPD No.</th>
                                        <th className="px-4 py-3 font-semibold">Patient</th>
                                        <th className="px-4 py-3 font-semibold">Type</th>
                                        <th className="px-4 py-3 font-semibold">Status</th>
                                        <th className="px-4 py-3 font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleVisits.map((visit) => (
                                        <tr
                                            key={visit.visit_id}
                                            className={`cursor-pointer border-t border-black ${selectedVisitId === visit.visit_id ? "bg-black/5" : "hover:bg-black/5"}`}
                                            onClick={() => setSelectedVisitId(visit.visit_id)}
                                        >
                                            <td className="px-4 py-3 font-bold text-black">{visit.daily_token_number ?? "-"}</td>
                                            <td className="px-4 py-3 font-semibold text-black">{visit.visit_number || visit.visit_id}</td>
                                            <td className="px-4 py-3">
                                                <div>
                                                    <p className="font-semibold text-black">{displayPatient(visit)}</p>
                                                    <p className="text-xs font-medium text-black">{visit.patient.uhid || "-"}</p>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-black">{visit.visit_type}</td>
                                            <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(visit.status)}`}>{visit.status}</span></td>
                                            <td className="px-4 py-3">
                                                <VisitActions
                                                    visit={visit}
                                                    printEnabled={printEnabled}
                                                    emrEnabled={emrEnabled}
                                                    acting={actingVisitId === visit.visit_id}
                                                    onStatus={updateStatus}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {mode === "queue" && (
                    <VisitDetailPanel
                        detail={detail}
                        activeVisit={activeVisit}
                        loading={detailLoading}
                    />
                )}
            </div>
            {mode === "visits" && (
                <PaginationControls
                    page={pagination.page}
                    totalPages={pagination.total_pages}
                    total={pagination.total}
                    onPageChange={setVisitPage}
                />
            )}
        </div>
    );
}

function VisitActions({
    visit,
    printEnabled,
    emrEnabled,
    acting,
    onStatus,
}: {
    visit: DoctorVisit;
    printEnabled: boolean;
    emrEnabled: boolean;
    acting: boolean;
    onStatus: (visit: DoctorVisit, status: "IN_CONSULT" | "COMPLETED" | "LAB") => Promise<void>;
}) {
    const canOpenEmr = emrEnabled && visit.status !== "CANCELLED";
    const canShowEmptyAction = visit.status === "CANCELLED";

    return (
        <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
            {canOpenEmr && (
                <a href={currentVisitEmrHref(visit)} target={emrWindowName(visit)} className="inline-flex items-center gap-1 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">
                    <FileText size={13} />
                    EMR
                </a>
            )}
            {emrEnabled && visit.patient.last_emr_visit_id && visit.patient.last_emr_visit_id !== visit.visit_id && (
                <a href={`/hms/doctor/visits/${visit.patient.last_emr_visit_id}`} target={emrWindowName(visit)} className="inline-flex items-center gap-1 rounded-lg border border-black px-3 py-1.5 text-xs font-semibold text-black hover:bg-black hover:text-white">
                    Past EMR
                </a>
            )}
            {visit.status === "WAITING" && (
                <button type="button" disabled={acting} onClick={() => void onStatus(visit, "IN_CONSULT")} className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50">
                    Start
                </button>
            )}
            {visit.status === "IN_CONSULT" && (
                <>
                    {printEnabled && visit.finalized_prescription_id && (
                        <a href={`/hms/doctor/visits/${visit.visit_id}/print?printType=CONSULTATION&prescriptionId=${visit.finalized_prescription_id}`} target={emrWindowName(visit)} rel="noopener,noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">
                            <Printer size={13} />
                            Print
                        </a>
                    )}
                    <button type="button" disabled={acting} onClick={() => void onStatus(visit, "COMPLETED")} className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50">Complete</button>
                </>
            )}
            {canShowEmptyAction && (
                <span className="text-xs text-black">-</span>
            )}
        </div>
    );
}

function VisitDetailPanel({
    detail,
    activeVisit,
    loading,
}: {
    detail: DetailResponse | null;
    activeVisit: DoctorVisit | VisitDetail | null;
    loading: boolean;
}) {
    if (!activeVisit) {
        return (
            <aside className="rounded-lg border border-black bg-white p-4 text-sm text-black">
                Select a visit.
            </aside>
        );
    }

    const visit = detail?.visit || activeVisit;
    const detailedVisit = isVisitDetail(visit) ? visit : null;

    return (
        <aside className="rounded-lg border border-black bg-white">
            <div className="flex items-center justify-between border-b border-black px-4 py-3">
                <h2 className="text-sm font-semibold text-black">Visit Details</h2>
                {loading && <Loader2 size={15} className="animate-spin text-black" />}
            </div>
            <div className="space-y-5 p-4">
                <section>
                    <div className="mb-3 flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-white">
                            <UserRound size={17} />
                        </span>
                        <div>
                            <p className="font-semibold text-black">{displayPatient(visit)}</p>
                            <p className="text-xs font-medium text-black">{visit.patient.uhid || "-"}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <DetailItem label="OPD No." value={visit.visit_number || visit.visit_id} />
                        <DetailItem label="Status" value={visit.status} />
                    </div>
                </section>

                <section className="grid grid-cols-2 gap-2 text-sm">
                    <DetailItem label="Type" value={visit.visit_type} />
                    <DetailItem label="Date" value={visit.visit_date} />
                    {detailedVisit?.doctor.room_no && <DetailItem label="Room" value={detailedVisit.doctor.room_no} />}
                    {visit.patient.phone && <DetailItem label="Mobile" value={visit.patient.phone} />}
                </section>
            </div>
        </aside>
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

function PaginationControls({
    page,
    totalPages,
    total,
    onPageChange,
}: {
    page: number;
    totalPages: number;
    total: number;
    onPageChange: (page: number) => void;
}) {
    if (totalPages <= 1 && total <= 25) return null;

    return (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black bg-white px-4 py-3 text-sm text-black">
            <span className="font-semibold">
                Showing page {page} of {totalPages} ({total} visits)
            </span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    className="rounded-lg border border-black px-3 py-1.5 font-semibold text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Previous
                </button>
                <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    className="rounded-lg border border-black px-3 py-1.5 font-semibold text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Next
                </button>
            </div>
        </div>
    );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-black bg-white px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-black">{label}</p>
            <p className="mt-1 font-semibold text-black">{value}</p>
        </div>
    );
}
