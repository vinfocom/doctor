"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Search, UserRound } from "lucide-react";

type SearchMode = "TOKEN" | "DETAILS";
type ScopeMode = "TODAY" | "ALL";
type PaymentStatus = "PENDING" | "DONE";

interface DoctorOption {
    doctor_id: number;
    doctor_name: string;
    clinic_id: number;
    clinic_name: string;
}

interface PatientRow {
    patient_id: number;
    full_name: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
    tmpregtoken: string | null;
    doctor_id: number | null;
    profile_type: "SELF" | "OTHER";
    doctor: {
        doctor_id: number;
        doctor_name: string | null;
    } | null;
    confirmed_appointment: {
        appointment_id: number;
        doctor_id: number | null;
        clinic_id: number | null;
        appointment_date: string | null;
        start_time: string | null;
        end_time: string | null;
        payment_status: PaymentStatus | null;
        status: string | null;
    } | null;
}

interface RowAvailability {
    startTime: string | null;
    endTime: string | null;
    tone: "ok" | "warn";
    message: string;
}

interface RowState {
    selectedDoctorId: string;
    appointmentDate: string;
    paymentStatus: PaymentStatus;
    availability: RowAvailability | null;
    loadingAvailability: boolean;
    feedback: { tone: "success" | "error"; message: string } | null;
    booking: boolean;
    confirmed: boolean;
    confirmedAppointmentId: number | null;
}

interface SearchResponse {
    patients: PatientRow[];
}

interface SearchTokenClientProps {
    canCreateAppointments: boolean;
    doctorOptions: DoctorOption[];
    todayYmd: string;
}

const DETAILS_SEARCH_PLACEHOLDER = "Search by patient, mobile, token, or doctor";

function addMinutesToTime(time: string, minutesToAdd: number) {
    const [hours, minutes] = time.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes + minutesToAdd;
    const nextHours = Math.floor(totalMinutes / 60) % 24;
    const nextMinutes = totalMinutes % 60;
    return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function formatDateLabel(value: string) {
    if (!value) return "Select date";
    return new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    });
}

function formatTimeLabel(value: string) {
    return new Date(`1970-01-01T${value}:00+05:30`).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
    });
}

function getCompactAvailabilityText(availability: RowAvailability | null) {
    if (!availability) return "Choose doctor/date";
    if (availability.tone === "ok" && availability.startTime) {
        return formatTimeLabel(availability.startTime);
    }
    if (/no slot/i.test(availability.message) || /does not have more slots/i.test(availability.message)) {
        return "No slot";
    }
    if (/select a doctor/i.test(availability.message)) {
        return "Choose doctor";
    }
    if (/unavailable/i.test(availability.message) || /leave/i.test(availability.message)) {
        return "Unavailable";
    }
    return "Choose doctor/date";
}

export default function SearchTokenClient({
    canCreateAppointments,
    doctorOptions,
    todayYmd,
}: SearchTokenClientProps) {
    const [searchMode, setSearchMode] = useState<SearchMode>("TOKEN");
    const [scopeMode, setScopeMode] = useState<ScopeMode>("TODAY");
    const [detailsQuery, setDetailsQuery] = useState("");
    const [year, setYear] = useState(todayYmd.slice(0, 4));
    const [month, setMonth] = useState(todayYmd.slice(5, 7));
    const [day, setDay] = useState(todayYmd.slice(8, 10));
    const [serial, setSerial] = useState("");
    const [patients, setPatients] = useState<PatientRow[]>([]);
    const [rows, setRows] = useState<Record<number, RowState>>({});
    const [loading, setLoading] = useState(true);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    const yearRef = useRef<HTMLInputElement | null>(null);
    const monthRef = useRef<HTMLInputElement | null>(null);
    const dayRef = useRef<HTMLInputElement | null>(null);
    const serialRef = useRef<HTMLInputElement | null>(null);
    const availabilityCache = useRef<Map<string, RowAvailability>>(new Map());

    const tokenDate = `${year.padEnd(4, "0").slice(0, 4)}-${month.padStart(2, "0").slice(0, 2)}-${day.padStart(2, "0").slice(0, 2)}`;
    const isTokenDateToday = tokenDate === todayYmd;
    const effectiveScope = searchMode === "TOKEN" && !isTokenDateToday ? "ALL" : scopeMode;

    const doctorOptionMap = useMemo(
        () =>
            doctorOptions.reduce<Record<number, DoctorOption>>((accumulator, option) => {
                accumulator[option.doctor_id] = option;
                return accumulator;
            }, {}),
        [doctorOptions]
    );

    useEffect(() => {
        serialRef.current?.focus();
    }, []);

    const runSearch = useCallback(async (nextMode = searchMode) => {
        setLoading(true);
        setSearchError(null);

        try {
            const params = new URLSearchParams();
            params.set("mode", nextMode.toLowerCase());
            params.set("scope", effectiveScope);
            params.set("limit", effectiveScope === "TODAY" ? "50" : "75");

            if (nextMode === "TOKEN") {
                params.set("year", year);
                params.set("month", month);
                params.set("day", day);
                params.set("serial", serial);
            } else if (detailsQuery.trim()) {
                params.set("query", detailsQuery.trim());
            }

            const response = await fetch(`/api/search-token?${params.toString()}`, {
                cache: "no-store",
            });

            const data = (await response.json()) as SearchResponse | { error?: string };
            if (!response.ok) {
                throw new Error("error" in data && data.error ? data.error : "Unable to search patients");
            }

            setPatients("patients" in data ? data.patients : []);
            setHasSearched(true);
        } catch (error) {
            console.error("Search token fetch failed:", error);
            setPatients([]);
            setSearchError(error instanceof Error ? error.message : "Unable to search patients");
        } finally {
            setLoading(false);
        }
    }, [day, detailsQuery, effectiveScope, month, searchMode, serial, year]);

    useEffect(() => {
        void runSearch(searchMode);
    }, [runSearch, scopeMode, searchMode]);

    useEffect(() => {
        setRows((previous) => {
            const next: Record<number, RowState> = {};

            for (const patient of patients) {
                const existing = previous[patient.patient_id];
                const confirmedAppointment = patient.confirmed_appointment;
                const defaultDoctorId = patient.doctor_id && doctorOptionMap[patient.doctor_id]
                    ? String(patient.doctor_id)
                    : "";
                const confirmedDoctorId = confirmedAppointment?.doctor_id && doctorOptionMap[confirmedAppointment.doctor_id]
                    ? String(confirmedAppointment.doctor_id)
                    : "";
                const confirmedStartTime = confirmedAppointment?.start_time || null;
                const confirmedEndTime = confirmedAppointment?.end_time || null;
                const confirmedAvailability: RowAvailability | null = confirmedStartTime
                    ? {
                        startTime: confirmedStartTime,
                        endTime: confirmedEndTime,
                        tone: "ok",
                        message: `Booked slot: ${formatTimeLabel(confirmedStartTime)}.`,
                    }
                    : null;

                next[patient.patient_id] = {
                    selectedDoctorId: confirmedDoctorId || existing?.selectedDoctorId || defaultDoctorId,
                    appointmentDate: confirmedAppointment?.appointment_date || existing?.appointmentDate || todayYmd,
                    paymentStatus: confirmedAppointment?.payment_status === "DONE"
                        ? "DONE"
                        : confirmedAppointment?.payment_status === "PENDING"
                            ? "PENDING"
                            : existing?.paymentStatus ?? "PENDING",
                    availability: confirmedAvailability ?? existing?.availability ?? null,
                    loadingAvailability: false,
                    feedback: existing?.feedback ?? null,
                    booking: false,
                    confirmed: Boolean(confirmedAppointment) || Boolean(existing?.confirmed),
                    confirmedAppointmentId: confirmedAppointment?.appointment_id ?? existing?.confirmedAppointmentId ?? null,
                };
            }

            return next;
        });
    }, [doctorOptionMap, patients, todayYmd]);

    const ensureAvailability = useCallback(async (patientId: number, doctorId: string, appointmentDate: string) => {
        if (rows[patientId]?.confirmed) {
            return;
        }

        if (!doctorId) {
            setRows((previous) => ({
                ...previous,
                [patientId]: {
                    ...previous[patientId],
                    availability: {
                        startTime: null,
                        endTime: null,
                        tone: "warn",
                        message: "Select a doctor to continue.",
                    },
                    loadingAvailability: false,
                },
            }));
            return;
        }

        const selectedDoctor = doctorOptionMap[Number(doctorId)];
        if (!selectedDoctor?.clinic_id || !appointmentDate) {
            return;
        }

        const cacheKey = `${selectedDoctor.clinic_id}|${appointmentDate}`;
        const cached = availabilityCache.current.get(cacheKey);
        if (cached) {
            setRows((previous) => {
                const current = previous[patientId];
                if (!current || current.selectedDoctorId !== doctorId || current.appointmentDate !== appointmentDate) {
                    return previous;
                }

                return {
                    ...previous,
                    [patientId]: {
                        ...current,
                        availability: cached,
                        loadingAvailability: false,
                    },
                };
            });
            return;
        }

        setRows((previous) => ({
            ...previous,
            [patientId]: {
                ...previous[patientId],
                loadingAvailability: true,
                feedback: previous[patientId]?.feedback?.tone === "success" ? previous[patientId].feedback : null,
            },
        }));

        try {
            const response = await fetch(
                `/api/slots?clinicId=${selectedDoctor.clinic_id}&date=${encodeURIComponent(appointmentDate)}`,
                { cache: "no-store" }
            );
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data?.error || "Unable to load slots");
            }

            let nextAvailability: RowAvailability;
            if (data?.leaveBlocked) {
                nextAvailability = {
                    startTime: null,
                    endTime: null,
                    tone: "warn",
                    message: data?.leaveReason
                        ? `Doctor unavailable: ${data.leaveReason}`
                        : "Doctor is unavailable for the selected date.",
                };
            } else if (!Array.isArray(data?.slots) || data.slots.length === 0) {
                nextAvailability = {
                    startTime: null,
                    endTime: null,
                    tone: "warn",
                    message: `This doctor does not have more slots on ${formatDateLabel(appointmentDate)}.`,
                };
            } else {
                const slotDuration = Number(data?.slot_duration) > 0 ? Number(data.slot_duration) : 30;
                const startTime = String(data.slots[0]);
                nextAvailability = {
                    startTime,
                    endTime: addMinutesToTime(startTime, slotDuration),
                    tone: "ok",
                    message: `Nearest slot: ${formatTimeLabel(startTime)} at ${selectedDoctor.clinic_name}.`,
                };
            }

            availabilityCache.current.set(cacheKey, nextAvailability);

            setRows((previous) => {
                const current = previous[patientId];
                if (!current || current.selectedDoctorId !== doctorId || current.appointmentDate !== appointmentDate) {
                    return previous;
                }

                return {
                    ...previous,
                    [patientId]: {
                        ...current,
                        availability: nextAvailability,
                        loadingAvailability: false,
                    },
                };
            });
        } catch (error) {
            console.error("Availability fetch failed:", error);
            setRows((previous) => {
                const current = previous[patientId];
                if (!current || current.selectedDoctorId !== doctorId || current.appointmentDate !== appointmentDate) {
                    return previous;
                }

                return {
                    ...previous,
                    [patientId]: {
                        ...current,
                        availability: {
                            startTime: null,
                            endTime: null,
                            tone: "warn",
                            message: error instanceof Error ? error.message : "Unable to load doctor slots.",
                        },
                        loadingAvailability: false,
                    },
                };
            });
        }
    }, [doctorOptionMap, rows]);

    useEffect(() => {
        for (const patient of patients) {
            const row = rows[patient.patient_id];
            if (!row || row.confirmed || row.loadingAvailability || row.availability || !row.selectedDoctorId || !row.appointmentDate) {
                continue;
            }

            void ensureAvailability(patient.patient_id, row.selectedDoctorId, row.appointmentDate);
        }
    }, [ensureAvailability, patients, rows]);

    function setSegmentValue(
        setter: (value: string) => void,
        rawValue: string,
        maxLength: number,
        nextRef?: { current: HTMLInputElement | null }
    ) {
        const cleaned = rawValue.replace(/\D/g, "").slice(0, maxLength);
        setter(cleaned);
        if (cleaned.length === maxLength) {
            nextRef?.current?.focus();
            nextRef?.current?.select();
        }
    }

    function focusPrevious(previousRef?: { current: HTMLInputElement | null }) {
        previousRef?.current?.focus();
        previousRef?.current?.select();
    }

    async function handleBooking(patient: PatientRow) {
        const row = rows[patient.patient_id];
        if (!row) return;
        if (row.confirmed) return;

        const selectedDoctor = doctorOptionMap[Number(row.selectedDoctorId)];
        if (!selectedDoctor) {
            setRows((previous) => ({
                ...previous,
                [patient.patient_id]: {
                    ...previous[patient.patient_id],
                    feedback: { tone: "error", message: "Select a doctor before confirming." },
                },
            }));
            return;
        }

        if (!patient.phone) {
            setRows((previous) => ({
                ...previous,
                [patient.patient_id]: {
                    ...previous[patient.patient_id],
                    feedback: { tone: "error", message: "Patient phone number is required before booking." },
                },
            }));
            return;
        }

        if (!row.availability?.startTime || !row.availability?.endTime) {
            setRows((previous) => ({
                ...previous,
                [patient.patient_id]: {
                    ...previous[patient.patient_id],
                    feedback: { tone: "error", message: "No slot is currently available for this selection." },
                },
            }));
            return;
        }

        setRows((previous) => ({
            ...previous,
            [patient.patient_id]: {
                ...previous[patient.patient_id],
                booking: true,
                feedback: null,
            },
        }));

        try {
            const response = await fetch("/api/appointments", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    patient_id: patient.patient_id,
                    patient_name: patient.full_name || "Patient",
                    patient_phone: patient.phone || "",
                    doctor_id: selectedDoctor.doctor_id,
                    clinic_id: selectedDoctor.clinic_id,
                    appointment_date: row.appointmentDate,
                    start_time: row.availability.startTime,
                    end_time: row.availability.endTime,
                    booking_for: patient.profile_type,
                    payment_status: row.paymentStatus,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || "Unable to confirm appointment");
            }

            const cacheKey = `${selectedDoctor.clinic_id}|${row.appointmentDate}`;
            availabilityCache.current.delete(cacheKey);

            setRows((previous) => ({
                ...Object.fromEntries(
                    Object.entries(previous).map(([key, value]) => {
                        const typedValue = value as RowState;
                        const sameSelection =
                            typedValue.selectedDoctorId === row.selectedDoctorId &&
                            typedValue.appointmentDate === row.appointmentDate;

                        if (Number(key) === patient.patient_id) {
                            return [
                                key,
                                {
                                    ...typedValue,
                                    booking: false,
                                    confirmed: true,
                                    confirmedAppointmentId: typeof data?.appointment_id === "number" ? data.appointment_id : null,
                                    feedback: {
                                        tone: "success",
                                        message: `Appointment booked for ${formatTimeLabel(row.availability!.startTime!)}.`,
                                    },
                                },
                            ];
                        }

                        if (!sameSelection) {
                            return [key, typedValue];
                        }

                        return [
                            key,
                            {
                                ...typedValue,
                                availability: null,
                                loadingAvailability: false,
                            },
                        ];
                    })
                ),
            }));
        } catch (error) {
            console.error("Appointment booking failed:", error);
            const cacheKey = `${selectedDoctor.clinic_id}|${row.appointmentDate}`;
            availabilityCache.current.delete(cacheKey);
            setRows((previous) => ({
                ...previous,
                [patient.patient_id]: {
                    ...previous[patient.patient_id],
                    booking: false,
                    availability: null,
                    feedback: {
                        tone: "error",
                        message: error instanceof Error ? error.message : "Unable to confirm appointment.",
                    },
                },
            }));
        }
    }

    const emptyStateMessage = hasSearched
        ? "No patients matched this search."
        : "Today’s latest token records will appear here.";

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-4 sm:px-5 lg:px-6">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-center">
                            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                                <UserRound className="h-3.5 w-3.5" />
                                NAH Search Token
                            </div>
                        </div>

                        {!canCreateAppointments ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                This staff account can search patients, but appointment confirmation is disabled because the current role is view-only.
                            </div>
                        ) : null}

                        <div className="flex flex-col items-center gap-4">
                            <div className="flex w-full max-w-4xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
                                <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
                                    <div className="w-full lg:max-w-[190px]">
                                        <select
                                            value={searchMode}
                                            onChange={(event) => setSearchMode(event.target.value as SearchMode)}
                                            className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
                                        >
                                            <option value="TOKEN">Token no</option>
                                            <option value="DETAILS">Patient details</option>
                                        </select>
                                    </div>

                                    {searchMode === "TOKEN" ? (
                                        <div className="flex min-h-[56px] flex-1 flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-semibold text-slate-800 focus-within:border-blue-400 focus-within:bg-white">
                                            <span className="tracking-[0.28em] text-slate-500">NAH</span>
                                            <span className="text-slate-300">/</span>
                                            <input
                                                ref={yearRef}
                                                value={year}
                                                onChange={(event) => setSegmentValue(setYear, event.target.value, 4, monthRef)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Backspace" && !year) {
                                                        event.preventDefault();
                                                    }
                                                    if (event.key === "Enter") {
                                                        void runSearch("TOKEN");
                                                    }
                                                }}
                                                className="w-20 border-none bg-transparent text-center text-xl font-semibold text-slate-900 outline-none"
                                                inputMode="numeric"
                                                placeholder="YYYY"
                                            />
                                            <span className="text-slate-300">/</span>
                                            <input
                                                ref={monthRef}
                                                value={month}
                                                onChange={(event) => setSegmentValue(setMonth, event.target.value, 2, dayRef)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Backspace" && !month) {
                                                        event.preventDefault();
                                                        focusPrevious(yearRef);
                                                    }
                                                    if (event.key === "Enter") {
                                                        void runSearch("TOKEN");
                                                    }
                                                }}
                                                className="w-14 border-none bg-transparent text-center text-xl font-semibold text-slate-900 outline-none"
                                                inputMode="numeric"
                                                placeholder="MM"
                                            />
                                            <span className="text-slate-300">/</span>
                                            <input
                                                ref={dayRef}
                                                value={day}
                                                onChange={(event) => setSegmentValue(setDay, event.target.value, 2, serialRef)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Backspace" && !day) {
                                                        event.preventDefault();
                                                        focusPrevious(monthRef);
                                                    }
                                                    if (event.key === "Enter") {
                                                        void runSearch("TOKEN");
                                                    }
                                                }}
                                                className="w-14 border-none bg-transparent text-center text-xl font-semibold text-slate-900 outline-none"
                                                inputMode="numeric"
                                                placeholder="DD"
                                            />
                                            <span className="text-slate-300">/</span>
                                            <input
                                                ref={serialRef}
                                                value={serial}
                                                onChange={(event) => setSegmentValue(setSerial, event.target.value, 5)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Backspace" && !serial) {
                                                        event.preventDefault();
                                                        focusPrevious(dayRef);
                                                    }
                                                    if (event.key === "Enter") {
                                                        void runSearch("TOKEN");
                                                    }
                                                }}
                                                className="min-w-[120px] flex-1 border-none bg-transparent text-xl font-semibold tracking-[0.32em] text-slate-900 outline-none"
                                                inputMode="numeric"
                                                placeholder="00001"
                                            />
                                        </div>
                                    ) : (
                                        <input
                                            value={detailsQuery}
                                            onChange={(event) => setDetailsQuery(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    void runSearch("DETAILS");
                                                }
                                            }}
                                            className="h-14 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-5 text-lg font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
                                            placeholder={DETAILS_SEARCH_PLACEHOLDER}
                                        />
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => void runSearch(searchMode)}
                                        className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 text-base font-semibold text-white transition hover:bg-slate-800"
                                    >
                                        <Search className="h-5 w-5" />
                                        Search
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                                        {(["TODAY", "ALL"] as ScopeMode[]).map((option) => {
                                            const isActive = effectiveScope === option;
                                            const disabled = searchMode === "TOKEN" && !isTokenDateToday && option === "TODAY";

                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    disabled={disabled}
                                                    onClick={() => setScopeMode(option)}
                                                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                                        isActive
                                                            ? "bg-slate-900 text-white"
                                                            : "text-slate-600 hover:text-slate-900"
                                                    } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
                                                >
                                                    {option === "TODAY" ? "Today" : "All"}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-900">Patients</h2>
                        <p className="text-sm font-medium text-slate-500">{patients.length}</p>
                    </div>

                    {searchError ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {searchError}
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50">
                            <div className="flex items-center gap-3 text-slate-600">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Loading patients...
                            </div>
                        </div>
                    ) : patients.length === 0 ? (
                        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                            <p className="text-base font-semibold text-slate-700">{emptyStateMessage}</p>
                            <p className="mt-2 text-sm text-slate-500">Try a different token serial, switch to patient details, or widen the filter to all records.</p>
                        </div>
                    ) : (
                        <div className="overflow-hidden border border-slate-200 bg-white">
                            {patients.map((patient) => {
                                const row = rows[patient.patient_id];
                                const feedbackTone = row?.feedback?.tone === "success"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-rose-200 bg-rose-50 text-rose-700";

                                return (
                                    <div
                                        key={patient.patient_id}
                                        className="border-b border-black px-3 py-2 last:border-b-0"
                                    >
                                        <div className="grid gap-2 xl:grid-cols-[minmax(0,1.95fr)_190px_95px_120px]">
                                            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-[minmax(150px,1.1fr)_minmax(130px,0.9fr)_minmax(220px,1.25fr)_minmax(120px,0.8fr)]">
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Patient</p>
                                                    <p className="mt-1 break-words text-sm font-semibold text-slate-900">{patient.full_name || "Unnamed patient"}</p>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Mob. no</p>
                                                    <p className="mt-1 break-all text-sm font-semibold text-slate-900">{patient.phone || "N/A"}</p>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Token no</p>
                                                    <p className="mt-1 break-all text-sm font-semibold text-slate-900">{patient.tmpregtoken || "N/A"}</p>
                                                </div>
                                                <div className="min-w-0 self-start">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Age / Gender</p>
                                                    <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                                                        {patient.age ?? "N/A"} / {patient.gender || "N/A"}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="px-1 py-1">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Doctor</p>
                                                <select
                                                    value={row?.selectedDoctorId || ""}
                                                    disabled={Boolean(row?.confirmed)}
                                                    onChange={(event) => {
                                                        const nextDoctorId = event.target.value;
                                                        setRows((previous) => ({
                                                            ...previous,
                                                            [patient.patient_id]: {
                                                                ...previous[patient.patient_id],
                                                                selectedDoctorId: nextDoctorId,
                                                                availability: null,
                                                                feedback: null,
                                                            },
                                                        }));
                                                        void ensureAvailability(patient.patient_id, nextDoctorId, row?.appointmentDate || todayYmd);
                                                    }}
                                                    className="mt-0.5 w-full border border-slate-300 bg-white px-1.5 py-1 text-[13px] font-semibold text-slate-900 outline-none"
                                                >
                                                    <option value="">Select doctor</option>
                                                    {doctorOptions.map((option) => (
                                                        <option key={option.doctor_id} value={option.doctor_id}>
                                                            {`Dr. ${option.doctor_name.replace(/^dr\.?\s+/i, "")}`}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Date</p>
                                                <input
                                                    type="date"
                                                    value={row?.appointmentDate || todayYmd}
                                                    disabled={Boolean(row?.confirmed)}
                                                    onChange={(event) => {
                                                        const nextDate = event.target.value;
                                                        setRows((previous) => ({
                                                            ...previous,
                                                            [patient.patient_id]: {
                                                                ...previous[patient.patient_id],
                                                                appointmentDate: nextDate,
                                                                availability: null,
                                                                feedback: null,
                                                            },
                                                        }));
                                                        void ensureAvailability(patient.patient_id, row?.selectedDoctorId || "", nextDate);
                                                    }}
                                                    className="mt-0.5 w-full border border-slate-300 bg-white px-1.5 py-1 text-[13px] font-semibold text-slate-900 outline-none"
                                                />
                                            </div>

                                            <label className="px-1 py-1">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Payment</p>
                                                <select
                                                    value={row?.paymentStatus || "PENDING"}
                                                    disabled={Boolean(row?.confirmed)}
                                                    onChange={(event) =>
                                                        setRows((previous) => ({
                                                            ...previous,
                                                            [patient.patient_id]: {
                                                                ...previous[patient.patient_id],
                                                                paymentStatus: event.target.value as PaymentStatus,
                                                            },
                                                        }))
                                                    }
                                                    className="mt-0.5 w-full border border-slate-300 bg-white px-1.5 py-1 text-[13px] font-semibold text-slate-900 outline-none"
                                                >
                                                    <option value="PENDING">Pending</option>
                                                    <option value="DONE">Done</option>
                                                </select>
                                            </label>

                                            <div className="flex min-w-[120px] flex-col gap-1 py-1">
                                                <p
                                                    className={`min-h-4 text-[11px] font-semibold ${
                                                        row?.availability?.tone === "ok"
                                                            ? "text-emerald-600"
                                                            : "text-amber-600"
                                                    }`}
                                                >
                                                    {row?.loadingAvailability ? "Checking..." : getCompactAvailabilityText(row?.availability || null)}
                                                </p>
                                                <button
                                                    type="button"
                                                    disabled={
                                                        !canCreateAppointments ||
                                                        !row?.selectedDoctorId ||
                                                        row?.loadingAvailability ||
                                                        row?.booking ||
                                                        row?.confirmed ||
                                                        !patient.phone ||
                                                        !row?.availability?.startTime
                                                    }
                                                    onClick={() => void handleBooking(patient)}
                                                    className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold transition ${
                                                        row?.confirmed
                                                            ? "cursor-default bg-slate-600 text-white"
                                                            : "bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                                    }`}
                                                >
                                                    {row?.booking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                                    {row?.confirmed ? "Confirmed" : "Confirm"}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-2 flex flex-col gap-2">
                                            {row?.feedback ? (
                                                <div className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-2 text-[13px] ${feedbackTone}`}>
                                                    {row.feedback.tone === "success" ? (
                                                        <CheckCircle2 className="h-4 w-4" />
                                                    ) : (
                                                        <AlertCircle className="h-4 w-4" />
                                                    )}
                                                    {row.feedback.message}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
