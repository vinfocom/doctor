"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Loader2, RefreshCw, Search, Ticket, UserRoundPlus, XCircle } from "lucide-react";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

type TempTokenCounts = {
    totalTokens: number;
    registeredTokens: number;
    pendingTokens: number;
    dateTokens: number;
    dateRegisteredTokens: number;
    datePendingTokens: number;
};

type PaginationState = {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
};

type TempToken = {
    registration_id: number;
    reg_date: string | null;
    seq_no: number;
    token: string;
    patient_name: string;
    phone: string | null;
    age: number | null;
    gender: string | null;
    patient_id: number | null;
    visit_id: number | null;
    resolved_at: string | null;
    doctor: {
        doctor_id: number;
        doctor_name: string | null;
    } | null;
    patient: {
        patient_id: number;
        uhid: string | null;
    } | null;
    visit: {
        visit_id: number;
        visit_number: string | null;
        status: string | null;
    } | null;
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

const PAGE_SIZE = 25;

export default function HmsRegistrationsClient() {
    const [query, setQuery] = useState("");
    const [todayDate] = useState(todayYmd());
    const [selectedDate, setSelectedDate] = useState(todayDate);
    const [sortDirection, setSortDirection] = useState<"ASC" | "DESC">("ASC");
    const [tempTokens, setTempTokens] = useState<TempToken[]>([]);
    const [counts, setCounts] = useState<TempTokenCounts | null>(null);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState<PaginationState>({
        page: 1,
        page_size: PAGE_SIZE,
        total: 0,
        total_pages: 1,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const clearError = useCallback(() => setError(""), []);

    useHmsAutoDismissMessage(error, clearError, 7500);
    const dateCounterLabel = selectedDate === todayDate ? "Today" : "Date";

    const loadTempTokens = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false;
        if (!silent) {
            setLoading(true);
            setError("");
        }

        try {
            const params = new URLSearchParams();
            if (query.trim()) params.set("q", query.trim());
            params.set("date", selectedDate);
            params.set("include_resolved", "1");
            params.set("limit", String(PAGE_SIZE));
            params.set("page", String(page));
            params.set("sort", sortDirection);
            const res = await fetch(`/api/hms/staff/temp-tokens${params.toString() ? `?${params.toString()}` : ""}`, { cache: "no-store" });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || "Unable to load pre-registration tokens.");
                return;
            }

            setTempTokens(Array.isArray(data.tempTokens) ? data.tempTokens : []);
            setCounts(data.counts || null);
            if (data.pagination) {
                setPagination(data.pagination);
            }
        } catch {
            setError("Unable to load pre-registration tokens. Check your connection and try again.");
        } finally {
            if (!silent) setLoading(false);
        }
    }, [page, query, selectedDate, sortDirection]);

    useEffect(() => {
        void loadTempTokens();
    }, [loadTempTokens]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            void loadTempTokens({ silent: true });
        }, 15000);

        return () => window.clearInterval(timer);
    }, [loadTempTokens]);

    useEffect(() => {
        setPage(1);
    }, [query, selectedDate, sortDirection]);

    useEffect(() => {
        if (page > pagination.total_pages) {
            setPage(Math.max(1, pagination.total_pages));
        }
    }, [page, pagination.total_pages]);

    return (
        <div className="w-full">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-black">Reception</p>
                    <h1 className="mt-1 text-2xl font-bold text-black sm:text-3xl">Pre-registration Tokens</h1>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-black">Date</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(event) => setSelectedDate(event.target.value)}
                            className="h-10 rounded-lg border border-black px-3 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                        />
                    </div>
                    <button type="button" onClick={() => void loadTempTokens()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
                        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && <HmsStatusAlert tone="error" message={error} onDismiss={clearError} />}

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <Counter label="All Tokens" value={counts?.totalTokens ?? 0} />
                <Counter label="All Registered" value={counts?.registeredTokens ?? 0} />
                <Counter label="All Pending" value={counts?.pendingTokens ?? 0} />
                <Counter label={`${dateCounterLabel} Tokens`} value={counts?.dateTokens ?? 0} />
                <Counter label={`${dateCounterLabel} Registered`} value={counts?.dateRegisteredTokens ?? 0} />
                <Counter label={`${dateCounterLabel} Pending`} value={counts?.datePendingTokens ?? 0} />
            </div>

            <div className="rounded-lg border border-black bg-white">
                <div className="grid gap-3 border-b border-black p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="relative">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black" />
                        <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-black py-2 pl-9 pr-9 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10" placeholder="Search token, name, phone" />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full border border-black bg-white p-1 text-black hover:bg-black hover:text-white"
                                aria-label="Clear search"
                            >
                                <XCircle size={14} />
                            </button>
                        )}
                    </div>
                    <button type="button" onClick={() => void loadTempTokens()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-black px-3 py-2 text-sm font-medium text-black hover:bg-black hover:text-white disabled:opacity-50">
                        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                        Search
                    </button>
                </div>

                {loading && tempTokens.length === 0 ? (
                    <div className="flex items-center gap-2 px-4 py-6 text-sm text-black">
                        <Loader2 size={16} className="animate-spin" />
                        Loading pre-registration tokens
                    </div>
                ) : tempTokens.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-black">No pre-registration tokens found.</div>
                ) : (
                    <div className="max-h-[72vh] overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white text-xs uppercase tracking-wide text-black">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">
                                        <button
                                            type="button"
                                            onClick={() => setSortDirection((value) => value === "ASC" ? "DESC" : "ASC")}
                                            className="inline-flex items-center gap-2 rounded-lg border border-black px-2 py-1 text-xs font-semibold text-black hover:bg-black hover:text-white"
                                            title={sortDirection === "ASC" ? "Token ascending" : "Token descending"}
                                            aria-label={sortDirection === "ASC" ? "Sort token descending" : "Sort token ascending"}
                                        >
                                            Token
                                            {sortDirection === "ASC" ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 font-semibold">Patient</th>
                                    <th className="px-4 py-3 font-semibold">Age/Sex</th>
                                    <th className="px-4 py-3 font-semibold">Phone</th>
                                    <th className="px-4 py-3 font-semibold">Doctor</th>
                                    <th className="px-4 py-3 font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tempTokens.map((tempToken) => (
                                    <tr key={tempToken.registration_id} className="border-t border-black">
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center gap-2 font-semibold text-black">
                                                <Ticket size={15} />
                                                {tempToken.token}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-black">{tempToken.patient_name}</td>
                                        <td className="px-4 py-3 text-black">{tempToken.age ?? "-"} / {tempToken.gender || "-"}</td>
                                        <td className="px-4 py-3 text-black">{tempToken.phone || "-"}</td>
                                        <td className="px-4 py-3 text-black">{tempToken.doctor?.doctor_name || "-"}</td>
                                        <td className="px-4 py-3 text-black">
                                            {tempToken.resolved_at || tempToken.visit_id ? (
                                                <span className="inline-flex items-center rounded-lg border border-black px-3 py-1.5 text-xs font-semibold text-black">
                                                    Registered
                                                </span>
                                            ) : (
                                                <Link
                                                    href={`/hms/staff/new-registration?tempTokenRegistrationId=${tempToken.registration_id}`}
                                                    className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
                                                >
                                                    <UserRoundPlus size={14} />
                                                    Register
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <PaginationControls
                    page={pagination.page}
                    totalPages={pagination.total_pages}
                    total={pagination.total}
                    loading={loading}
                    onPageChange={setPage}
                />
            </div>
        </div>
    );
}

function Counter({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-black bg-white px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-black">{label}</p>
            <p className="mt-1 text-xl font-bold text-black">{value}</p>
        </div>
    );
}

function PaginationControls({
    page,
    totalPages,
    total,
    loading,
    onPageChange,
}: {
    page: number;
    totalPages: number;
    total: number;
    loading: boolean;
    onPageChange: (page: number) => void;
}) {
    if (total <= PAGE_SIZE) return null;

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black px-4 py-3 text-sm text-black">
            <span className="font-semibold">
                {total} tokens
            </span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    disabled={loading || page <= 1}
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    className="rounded-lg border border-black px-3 py-1.5 font-semibold text-black hover:bg-black hover:text-white disabled:opacity-40"
                >
                    Previous
                </button>
                <span className="min-w-24 text-center font-semibold">Page {page} / {Math.max(1, totalPages)}</span>
                <button
                    type="button"
                    disabled={loading || page >= totalPages}
                    onClick={() => onPageChange(Math.min(Math.max(1, totalPages), page + 1))}
                    className="rounded-lg border border-black px-3 py-1.5 font-semibold text-black hover:bg-black hover:text-white disabled:opacity-40"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
