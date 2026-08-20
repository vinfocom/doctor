"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

type Summary = {
    total_visits: number;
    opd_new: number;
    opd_old: number;
    followup: number;
    referral: number;
    lab_only: number;
    casualty: number;
    waiting: number;
    in_consult: number;
    lab: number;
    completed: number;
    cancelled: number;
    total_fee_charged: number;
    paid_amount: number;
    pending_amount: number;
    free_visits: number;
    waived_amount: number;
    surcharge_amount: number;
    cash_amount: number;
    upi_amount: number;
    card_amount: number;
};

type DailyRow = { date: string } & Summary;

type DoctorRow = {
    doctor_id: number;
    doctor_name: string;
    room_no: string | null;
    daily_capacity: number | null;
    total_visits: number;
    capacity_used: number;
    beyond_capacity_count: number;
    opd_new: number;
    opd_old: number;
    followup: number;
    referral: number;
    lab_only: number;
    completed: number;
    cancelled: number;
    total_fee_charged: number;
    paid_amount: number;
    pending_amount: number;
    free_visits: number;
    surcharge_amount: number;
};

type RegistrationRow = {
    visit_id: number;
    date: string;
    created_at: string | null;
    opd_no: string | null;
    token_no: number | null;
    uhid: string | null;
    patient_name: string;
    age: number | null;
    gender: string | null;
    phone: string | null;
    visit_type: string;
    status: string;
    doctor_name: string;
    room_no: string | null;
    referral_route: string | null;
    fee_charged: number;
    estimated_surcharge: number;
    payment_mode: string;
    payment_status: string;
    fee_waived_reason: string | null;
    registered_by: string | null;
};

type StaffRow = {
    user_id: number;
    staff_name: string;
    total_registrations: number;
    cancelled_visits: number;
    paid_amount: number;
    pending_amount: number;
    free_visits: number;
    waived_amount: number;
};

type PreRegistrationSummary = {
    total_tokens: number;
    converted_tokens: number;
    pending_tokens: number;
    doctor_selected_tokens: number;
    doctor_missing_tokens: number;
    conversion_rate: number;
};

type Reports = {
    from_date: string;
    to_date: string;
    summary: Summary;
    daily: DailyRow[];
    doctors: DoctorRow[];
    registrations: RegistrationRow[];
    pending_payments: RegistrationRow[];
    waivers: RegistrationRow[];
    staff_activity: StaffRow[];
    pre_registration: PreRegistrationSummary;
};

function todayYmd() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function money(value: number | null | undefined) {
    return Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    });
}

function plain(value: number | null | undefined) {
    return Number(value || 0).toLocaleString("en-IN");
}

function statusLabel(value: string) {
    return value.replace(/_/g, " ");
}

function ageSex(row: RegistrationRow) {
    const gender = row.gender ? row.gender.slice(0, 1).toUpperCase() : "-";
    return `${row.age ?? "-"}/${gender}`;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-black bg-white p-4">
            <p className="text-xs font-bold uppercase text-black">{label}</p>
            <p className="mt-2 text-2xl font-bold text-black">{value}</p>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-lg font-bold text-black">{title}</h2>
            {children}
        </section>
    );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
    return (
        <tr>
            <td colSpan={colSpan} className="px-4 py-6 text-center text-sm font-semibold text-black">
                No data found.
            </td>
        </tr>
    );
}

export default function HmsReportsClient() {
    const [fromDate, setFromDate] = useState(todayYmd());
    const [toDate, setToDate] = useState(todayYmd());
    const [reports, setReports] = useState<Reports | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState("");
    const clearError = useCallback(() => setError(""), []);

    const queryString = useMemo(() => {
        const params = new URLSearchParams();
        params.set("from_date", fromDate);
        params.set("to_date", toDate);
        return params.toString();
    }, [fromDate, toDate]);

    useHmsAutoDismissMessage(error, clearError, 7500);

    const loadReports = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/hms/hospital-admin/reports?${queryString}`, { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || "Unable to load reports.");
            }
            setReports(data.reports as Reports);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to load reports.");
        } finally {
            setLoading(false);
        }
    }, [queryString]);

    useEffect(() => {
        void loadReports();
    }, [loadReports]);

    const downloadExcel = async () => {
        setDownloading(true);
        setError("");
        try {
            const response = await fetch(`/api/hms/hospital-admin/reports/export?${queryString}`, { cache: "no-store" });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || "Unable to download Excel report.");
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `hms-report-${fromDate}-to-${toDate}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to download Excel report.");
        } finally {
            setDownloading(false);
        }
    };

    const summary = reports?.summary;

    return (
        <div className="space-y-6 text-black">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase text-black">Hospital Admin</p>
                    <h1 className="mt-1 text-3xl font-bold text-black">Reports</h1>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="space-y-1">
                        <span className="text-xs font-bold uppercase text-black">From</span>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(event) => setFromDate(event.target.value)}
                            className="h-10 rounded-lg border border-black px-3 text-sm font-semibold text-black outline-none"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-bold uppercase text-black">To</span>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(event) => setToDate(event.target.value)}
                            className="h-10 rounded-lg border border-black px-3 text-sm font-semibold text-black outline-none"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => void loadReports()}
                        disabled={loading}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-black px-4 text-sm font-bold text-black hover:bg-black hover:text-white disabled:opacity-60"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => void downloadExcel()}
                        disabled={downloading || loading || !reports}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white disabled:opacity-60"
                    >
                        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {downloading ? "Preparing Excel" : "Download Excel"}
                    </button>
                </div>
            </div>

            {error ? <HmsStatusAlert tone="error" message={error} onDismiss={clearError} className="mb-0" /> : null}

            {loading && !reports ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-black bg-white">
                    <div className="flex items-center gap-3 text-sm font-bold text-black">
                        <Loader2 size={20} className="animate-spin" />
                        Loading reports
                    </div>
                </div>
            ) : reports && summary ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <MetricCard label="Total Visits" value={plain(summary.total_visits)} />
                        <MetricCard label="Paid" value={money(summary.paid_amount)} />
                        <MetricCard label="Pending" value={money(summary.pending_amount)} />
                        <MetricCard label="Total Fee" value={money(summary.total_fee_charged)} />
                        <MetricCard label="Surcharge" value={money(summary.surcharge_amount)} />
                        <MetricCard label="New OPD" value={plain(summary.opd_new)} />
                        <MetricCard label="Old OPD" value={plain(summary.opd_old)} />
                        <MetricCard label="Follow-up" value={plain(summary.followup)} />
                        <MetricCard label="Referral" value={plain(summary.referral)} />
                        <MetricCard label="Free Visits" value={plain(summary.free_visits)} />
                    </div>

                    <Section title="Status">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            <MetricCard label="Waiting" value={plain(summary.waiting)} />
                            <MetricCard label="In Consult" value={plain(summary.in_consult)} />
                            <MetricCard label="Lab" value={plain(summary.lab)} />
                            <MetricCard label="Completed" value={plain(summary.completed)} />
                            <MetricCard label="Cancelled" value={plain(summary.cancelled)} />
                        </div>
                    </Section>

                    <Section title="Payment Split">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricCard label="Cash" value={money(summary.cash_amount)} />
                            <MetricCard label="UPI" value={money(summary.upi_amount)} />
                            <MetricCard label="Card" value={money(summary.card_amount)} />
                            <MetricCard label="Waived" value={money(summary.waived_amount)} />
                        </div>
                    </Section>

                    <Section title="Pre-registration Tokens">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                            <MetricCard label="Total Tokens" value={plain(reports.pre_registration.total_tokens)} />
                            <MetricCard label="Converted to OPD" value={plain(reports.pre_registration.converted_tokens)} />
                            <MetricCard label="Pending Tokens" value={plain(reports.pre_registration.pending_tokens)} />
                            <MetricCard label="Doctor Selected" value={plain(reports.pre_registration.doctor_selected_tokens)} />
                            <MetricCard label="Doctor Missing" value={plain(reports.pre_registration.doctor_missing_tokens)} />
                            <MetricCard label="Conversion Rate" value={`${reports.pre_registration.conversion_rate}%`} />
                        </div>
                    </Section>

                    <Section title="Doctor Wise">
                        <div className="overflow-x-auto rounded-lg border border-black bg-white">
                            <table className="min-w-full text-left text-sm text-black">
                                <thead className="bg-black text-xs uppercase text-white">
                                    <tr>
                                        <th className="px-4 py-3">Doctor</th>
                                        <th className="px-4 py-3">Room</th>
                                        <th className="px-4 py-3">Capacity</th>
                                        <th className="px-4 py-3">Visits</th>
                                        <th className="px-4 py-3">Non-cancelled</th>
                                        <th className="px-4 py-3">Beyond</th>
                                        <th className="px-4 py-3">Paid</th>
                                        <th className="px-4 py-3">Pending</th>
                                        <th className="px-4 py-3">Surcharge</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black">
                                    {reports.doctors.length === 0 ? <EmptyRow colSpan={9} /> : reports.doctors.map((doctor) => (
                                        <tr key={doctor.doctor_id}>
                                            <td className="px-4 py-3 font-bold">Dr. {doctor.doctor_name}</td>
                                            <td className="px-4 py-3">{doctor.room_no || "-"}</td>
                                            <td className="px-4 py-3">{doctor.daily_capacity ?? "-"}</td>
                                            <td className="px-4 py-3">{doctor.total_visits}</td>
                                            <td className="px-4 py-3">{doctor.capacity_used}</td>
                                            <td className="px-4 py-3">{doctor.beyond_capacity_count}</td>
                                            <td className="px-4 py-3">{money(doctor.paid_amount)}</td>
                                            <td className="px-4 py-3">{money(doctor.pending_amount)}</td>
                                            <td className="px-4 py-3">{money(doctor.surcharge_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <Section title="Daily">
                            <div className="overflow-x-auto rounded-lg border border-black bg-white">
                                <table className="min-w-full text-left text-sm text-black">
                                    <thead className="bg-black text-xs uppercase text-white">
                                        <tr>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Visits</th>
                                            <th className="px-4 py-3">Paid</th>
                                            <th className="px-4 py-3">Pending</th>
                                            <th className="px-4 py-3">Cancelled</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black">
                                        {reports.daily.length === 0 ? <EmptyRow colSpan={5} /> : reports.daily.map((row) => (
                                            <tr key={row.date}>
                                                <td className="px-4 py-3 font-bold">{row.date}</td>
                                                <td className="px-4 py-3">{row.total_visits}</td>
                                                <td className="px-4 py-3">{money(row.paid_amount)}</td>
                                                <td className="px-4 py-3">{money(row.pending_amount)}</td>
                                                <td className="px-4 py-3">{row.cancelled}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>

                        <Section title="Staff Activity">
                            <div className="overflow-x-auto rounded-lg border border-black bg-white">
                                <table className="min-w-full text-left text-sm text-black">
                                    <thead className="bg-black text-xs uppercase text-white">
                                        <tr>
                                            <th className="px-4 py-3">Staff</th>
                                            <th className="px-4 py-3">Registrations</th>
                                            <th className="px-4 py-3">Cancelled</th>
                                            <th className="px-4 py-3">Paid</th>
                                            <th className="px-4 py-3">Pending</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black">
                                        {reports.staff_activity.length === 0 ? <EmptyRow colSpan={5} /> : reports.staff_activity.map((row) => (
                                            <tr key={row.user_id}>
                                                <td className="px-4 py-3 font-bold">{row.staff_name}</td>
                                                <td className="px-4 py-3">{row.total_registrations}</td>
                                                <td className="px-4 py-3">{row.cancelled_visits}</td>
                                                <td className="px-4 py-3">{money(row.paid_amount)}</td>
                                                <td className="px-4 py-3">{money(row.pending_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>
                    </div>

                    <Section title="Pending Payments">
                        <RegistrationTable key={`pending-${reports.from_date}-${reports.to_date}`} rows={reports.pending_payments} emptyColSpan={10} />
                    </Section>

                    <Section title="Waivers">
                        <RegistrationTable key={`waivers-${reports.from_date}-${reports.to_date}`} rows={reports.waivers} emptyColSpan={10} />
                    </Section>

                    <Section title="Registration List">
                        <RegistrationTable key={`registrations-${reports.from_date}-${reports.to_date}`} rows={reports.registrations} emptyColSpan={10} />
                    </Section>
                </>
            ) : null}
        </div>
    );
}

function RegistrationTable({ rows, emptyColSpan }: { rows: RegistrationRow[]; emptyColSpan: number }) {
    const [page, setPage] = useState(1);
    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

    return (
        <div className="rounded-lg border border-black bg-white">
            <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-black">
                    <thead className="bg-black text-xs uppercase text-white">
                        <tr>
                            <th className="px-4 py-3">OPD</th>
                            <th className="px-4 py-3">Patient</th>
                            <th className="px-4 py-3">Doctor</th>
                            <th className="px-4 py-3">Referral</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Fee</th>
                            <th className="px-4 py-3">Payment</th>
                            <th className="px-4 py-3">Registered By</th>
                            <th className="px-4 py-3">Date</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black">
                        {rows.length === 0 ? <EmptyRow colSpan={emptyColSpan} /> : visibleRows.map((row) => (
                            <tr key={row.visit_id}>
                                <td className="max-w-[220px] truncate px-4 py-3 font-bold" title={row.opd_no || "-"}>{row.opd_no || "-"}</td>
                                <td className="px-4 py-3">
                                    <div className="max-w-[240px] truncate font-bold" title={`${row.patient_name} (${ageSex(row)})`}>{row.patient_name} ({ageSex(row)})</div>
                                    <div className="max-w-[240px] truncate text-xs font-semibold text-black" title={`${row.uhid || "-"} ${row.phone ? `| ${row.phone}` : ""}`}>{row.uhid || "-"} {row.phone ? `| ${row.phone}` : ""}</div>
                                </td>
                                <td className="max-w-[220px] truncate px-4 py-3" title={`Dr. ${row.doctor_name}${row.room_no ? ` | ${row.room_no}` : ""}`}>Dr. {row.doctor_name}{row.room_no ? ` | ${row.room_no}` : ""}</td>
                                <td className="px-4 py-3 font-semibold text-black">{row.referral_route || "-"}</td>
                                <td className="px-4 py-3">{statusLabel(row.visit_type)}</td>
                                <td className="px-4 py-3">{statusLabel(row.status)}</td>
                                <td className="px-4 py-3">{money(row.fee_charged)}</td>
                                <td className="px-4 py-3">{row.payment_status} | {row.payment_mode}</td>
                                <td className="max-w-[180px] truncate px-4 py-3" title={row.registered_by || "-"}>{row.registered_by || "-"}</td>
                                <td className="px-4 py-3">{row.date}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.length > pageSize ? (
                <div className="flex items-center justify-between border-t border-black px-4 py-3 text-sm font-bold text-black">
                    <span>Page {safePage} of {totalPages}</span>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={safePage === 1} className="rounded-lg border border-black px-3 py-1 disabled:opacity-50">Previous</button>
                        <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={safePage === totalPages} className="rounded-lg border border-black px-3 py-1 disabled:opacity-50">Next</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
