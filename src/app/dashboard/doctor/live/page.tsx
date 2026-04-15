"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Maximize, Minimize } from "lucide-react";
import { convertTo12Hour, formatTime } from "@/lib/timeUtils";

type ScheduleOption = {
    schedule_id: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
};

type ClinicOption = {
    clinic_id: number;
    clinic_name?: string | null;
    doctor?: {
        doctor_id: number;
        doctor_name?: string | null;
    } | null;
    schedules?: ScheduleOption[];
};

type QueueCard = {
    appointment_id: number;
    queue_number: number;
    patient_name: string;
    status: string;
    start_time_label: string;
};

type LiveResponse = {
    doctor_name: string;
    clinic_name: string;
    selected_clinic_id: number | null;
    today_label: string;
    now_label: string;
    current: QueueCard | null;
    next: QueueCard | null;
    missed: QueueCard[];
    remaining: QueueCard[];
    total_today: number;
};

type MeResponse = {
    user: {
        role: "DOCTOR" | "CLINIC_STAFF";
        name?: string | null;
        staff_clinic_id?: number | null;
    };
};

const EMPTY_STATE: LiveResponse = {
    doctor_name: "",
    clinic_name: "",
    selected_clinic_id: null,
    today_label: "",
    now_label: "",
    current: null,
    next: null,
    missed: [],
    remaining: [],
    total_today: 0,
};

const ROTATE_INTERVAL_MS = 3000;
const TICKER_SEPARATOR = " \u2022 ";
const TICKER_MESSAGE =
    [
        "Please wait for your number",
        "Keep your documents ready",
        "Follow staff instructions",
        "Keep your phone on silent",
        "Please remain seated in the waiting area",
        "Visit reception for any assistance",
        "Thank you for your patience",
    ].join(TICKER_SEPARATOR);

function formatISTClock(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
    }).format(date).replace(/\b(am|pm)\b/g, (match) => match.toUpperCase());
}

function formatISTDate(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    }).format(date);
}

function getISTDayOfWeek(date: Date) {
    const label = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "Asia/Kolkata",
    }).format(date);

    const mapping: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };

    return mapping[label] ?? 0;
}

function buildScheduleLabel(clinic: ClinicOption | null, now: Date) {
    const schedules = clinic?.schedules || [];
    if (schedules.length === 0) return "Doctor Schedule: Not available";

    const todaySchedules = schedules
        .filter((schedule) => schedule.day_of_week === getISTDayOfWeek(now))
        .sort((left, right) => formatTime(left.start_time).localeCompare(formatTime(right.start_time)));

    if (todaySchedules.length === 0) return "Doctor Schedule: Not available";

    const first = todaySchedules[0];
    const last = todaySchedules[todaySchedules.length - 1];

    return `Doctor Schedule: ${convertTo12Hour(formatTime(first.start_time))} - ${convertTo12Hour(formatTime(last.end_time))}`;
}

function formatDoctorName(value: string | null | undefined) {
    const name = String(value || "").trim();
    if (!name) return "Dr. Doctor";
    return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

function splitIntoPages<T>(items: T[], pageSize: number) {
    const pages: T[][] = [];

    for (let index = 0; index < items.length; index += pageSize) {
        pages.push(items.slice(index, index + pageSize));
    }

    return pages.length > 0 ? pages : [[]];
}

function splitColumns<T>(items: T[], rowsPerColumn: number) {
    return {
        left: items.slice(0, rowsPerColumn),
        right: items.slice(rowsPerColumn, rowsPerColumn * 2),
    };
}

function FocusCard({
    label,
    appointment,
    compact = false,
}: {
    label: string;
    appointment: QueueCard | null;
    compact?: boolean;
}) {
    const numberColor = label.toLowerCase() === "next" ? "text-orange-300" : "text-emerald-400";

    return (
        <div className={`flex min-h-0 flex-col items-center justify-center text-center ${compact ? "h-full gap-[clamp(0.35rem,0.8vh,0.75rem)] px-2 py-1" : "min-h-[200px] gap-3 px-4 py-5 sm:min-h-[240px] sm:gap-4"}`}>
            <p className={`${compact ? "text-[clamp(1rem,1.8vw,1.35rem)] tracking-[0.22em]" : "text-[1rem] tracking-[0.22em] sm:text-[1.15rem] lg:text-[1.3rem] lg:tracking-[0.28em]"} font-bold uppercase text-slate-500`}>{label}</p>
            <div className={`${compact ? "text-[clamp(3.2rem,10vmin,7rem)]" : "text-[clamp(3.6rem,16vw,6.5rem)] sm:text-[clamp(4.5rem,12vw,8rem)]"} font-black leading-none ${numberColor}`}>
                {appointment?.queue_number ?? "--"}
            </div>
            <p className={`max-w-full truncate font-semibold text-slate-900 ${compact ? "text-[clamp(0.95rem,2vmin,1.5rem)]" : "text-[1rem] sm:text-[1.15rem] lg:text-[clamp(1.15rem,2.5vw,2rem)]"}`}>
                {appointment?.patient_name || "No Patient"}
            </p>
        </div>
    );
}

function RotatingAppointmentGrid({
    title,
    items,
    compact = false,
}: {
    title: string;
    items: QueueCard[];
    compact?: boolean;
}) {
    const pages = useMemo(() => splitIntoPages(items, 8), [items]);
    const [pageIndex, setPageIndex] = useState(0);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        if (pages.length <= 1) return;

        const interval = window.setInterval(() => {
            setFading(true);
            window.setTimeout(() => {
                setPageIndex((current) => (current + 1) % pages.length);
                setFading(false);
            }, 220);
        }, ROTATE_INTERVAL_MS);

        return () => window.clearInterval(interval);
    }, [pages.length]);

    const normalizedPageIndex = pageIndex >= pages.length ? 0 : pageIndex % pages.length;
    const activePage = pages[normalizedPageIndex] || [];
    const columns = splitColumns(activePage, 4);
    const isMissedSection = title.toLowerCase() === "missed";
    const sectionTone = isMissedSection
        ? "border-sky-200 bg-sky-50/65 text-sky-600"
        : "border-indigo-200 bg-indigo-50/55 text-indigo-500";
    const appointmentNumberColor = isMissedSection ? "text-red-500" : "text-indigo-600";

    const numberColumnClass = compact ? "grid-cols-[clamp(3.5rem,8vw,5.5rem)_minmax(0,1fr)]" : "grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[88px_minmax(0,1fr)]";
    const rowCardClass = compact
        ? "min-h-[clamp(1.5rem,3vh,2.1rem)] gap-[clamp(0.2rem,0.45vw,0.35rem)] px-[clamp(0.38rem,0.7vw,0.55rem)] py-[clamp(0.08rem,0.2vh,0.18rem)]"
        : "min-h-[48px] gap-2 px-2.5 sm:min-h-[56px] sm:px-3";
    const sectionPaddingClass = compact ? "px-[clamp(0.75rem,1.6vmin,1.05rem)] pb-[clamp(0.4rem,0.9vmin,0.65rem)] pt-[clamp(0.45rem,1vmin,0.7rem)]" : "p-3 sm:p-4 lg:p-5";
    const sectionHeaderClass = compact ? "mb-[clamp(0.2rem,0.45vh,0.35rem)]" : "mb-4";
    const sectionTitleClass = compact ? "text-[clamp(0.78rem,1.45vmin,1rem)] tracking-[0.18em]" : "text-[clamp(0.85rem,1.8vmin,1.15rem)] tracking-[0.24em]";
    const columnHeaderClass = compact
        ? "px-2 pb-0 text-[clamp(0.52rem,0.9vmin,0.72rem)] tracking-[0.11em]"
        : "px-2.5 pb-1.5 sm:px-3 sm:pb-2";

    const renderColumn = (columnItems: QueueCard[], columnKey: string) => (
        <div
                className={`grid min-h-0 ${compact ? "gap-[clamp(0.18rem,0.45vh,0.32rem)]" : "gap-2"}`}
            style={{ gridTemplateRows: "auto repeat(4, minmax(0, 1fr))" }}
        >
            <div className={`grid ${numberColumnClass} font-semibold uppercase text-slate-500 ${compact ? columnHeaderClass : `text-[clamp(0.62rem,1.15vmin,0.9rem)] tracking-[0.16em] ${columnHeaderClass}`}`}>
                <span>No.</span>
                <span>Patient Name</span>
            </div>
            {Array.from({ length: 4 }).map((_, index) => {
                const appointment = columnItems[index];
                return (
                    <div
                        key={appointment ? appointment.appointment_id : `${title}-${columnKey}-${index}`}
                        className={`grid min-h-0 ${numberColumnClass} items-center rounded-[clamp(1rem,2vmin,1.5rem)] bg-white/75 ${rowCardClass}`}
                    >
                        {appointment ? (
                            <>
                                <div className={`${compact ? "text-[clamp(0.82rem,1.55vmin,1.1rem)] leading-none" : "text-xl sm:text-2xl"} font-black ${appointmentNumberColor}`}>{appointment.queue_number}</div>
                                <div className="min-w-0">
                                    <p className={`truncate font-semibold text-slate-900 ${compact ? "text-[clamp(0.76rem,1.16vmin,0.94rem)] leading-tight" : "text-[1rem] sm:text-[1.08rem] lg:text-[1.18rem]"}`}>
                                        {appointment.patient_name}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="col-span-2" />
                        )}
                    </div>
                );
            })}
        </div>
    );

    return (
        <section className={`flex min-h-0 flex-col overflow-hidden rounded-[clamp(1.35rem,3vmin,2.25rem)] border ${sectionTone} ${sectionPaddingClass}`}>
            <div className={`flex shrink-0 items-center justify-between gap-3 ${sectionHeaderClass}`}>
                <h2 className={`${sectionTitleClass} font-black uppercase`}>{title}</h2>
                {pages.length > 1 ? (
                    <div className={compact ? "text-[clamp(0.62rem,1vmin,0.8rem)] font-medium text-slate-400" : "text-sm font-medium text-slate-400"}>
                        {normalizedPageIndex + 1}/{pages.length}
                    </div>
                ) : null}
            </div>

            <div
                className={`grid min-h-0 flex-1 transition-opacity duration-300 ${compact ? "grid-cols-2 gap-[clamp(0.45rem,1.05vmin,0.8rem)]" : "grid-cols-1 gap-3 md:grid-cols-2 md:gap-4"} ${fading ? "opacity-0" : "opacity-100"}`}
            >
                {renderColumn(columns.left, "left")}
                {renderColumn(columns.right, "right")}
            </div>
        </section>
    );
}

export default function LiveAppointmentsPage() {
    const fullscreenRef = useRef<HTMLDivElement | null>(null);
    const [me, setMe] = useState<MeResponse["user"] | null>(null);
    const [clinics, setClinics] = useState<ClinicOption[]>([]);
    const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
    const [liveData, setLiveData] = useState<LiveResponse>(EMPTY_STATE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [clock, setClock] = useState(() => formatISTClock(new Date()));
    const [todayLabel, setTodayLabel] = useState(() => formatISTDate(new Date()));
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const timer = window.setInterval(() => {
            const now = new Date();
            setClock(formatISTClock(now));
            setTodayLabel(formatISTDate(now));
        }, 1000);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const syncFullscreenState = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };

        syncFullscreenState();
        document.addEventListener("fullscreenchange", syncFullscreenState);

        return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            try {
                setLoading(true);
                setError("");

                const [meRes, clinicsRes] = await Promise.all([
                    fetch("/api/auth/me", { cache: "no-store" }),
                    fetch("/api/clinics", { cache: "no-store" }),
                ]);

                if (!meRes.ok) throw new Error("Unable to verify user session.");
                if (!clinicsRes.ok) throw new Error("Unable to load clinics.");

                const meJson: MeResponse = await meRes.json();
                const clinicsJson = await clinicsRes.json();
                const clinicList: ClinicOption[] = Array.isArray(clinicsJson.clinics) ? clinicsJson.clinics : [];

                if (cancelled) return;

                setMe(meJson.user);
                setClinics(clinicList);

                const defaultClinicId =
                    meJson.user.role === "CLINIC_STAFF"
                        ? meJson.user.staff_clinic_id ?? clinicList[0]?.clinic_id ?? null
                        : clinicList[0]?.clinic_id ?? null;

                setSelectedClinicId(defaultClinicId);
            } catch (caughtError) {
                if (!cancelled) {
                    setError(caughtError instanceof Error ? caughtError.message : "Failed to load live page.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        bootstrap();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedClinicId) {
            setLiveData(EMPTY_STATE);
            return;
        }

        let cancelled = false;

        const loadLiveData = async () => {
            try {
                const res = await fetch(`/api/appointments/live?clinicId=${selectedClinicId}`, {
                    cache: "no-store",
                });

                if (!res.ok) {
                    const body = await res.json().catch(() => null);
                    throw new Error(body?.error || "Failed to load live appointments.");
                }

                const data: LiveResponse = await res.json();
                if (!cancelled) {
                    setLiveData(data);
                }
            } catch (caughtError) {
                if (!cancelled) {
                    setError(caughtError instanceof Error ? caughtError.message : "Failed to load live appointments.");
                }
            }
        };

        loadLiveData();

        const interval = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                loadLiveData();
            }
        }, 5000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [selectedClinicId]);

    const selectedClinic = useMemo(
        () => clinics.find((clinic) => clinic.clinic_id === selectedClinicId) || null,
        [clinics, selectedClinicId]
    );

    const scheduleLabel = useMemo(() => buildScheduleLabel(selectedClinic, new Date()), [selectedClinic]);

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await fullscreenRef.current?.requestFullscreen();
                return;
            }

            await document.exitFullscreen();
        } catch {
            setError("Fullscreen mode is not available on this device.");
        }
    };

    if (loading && !liveData.today_label && !error) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div
            ref={fullscreenRef}
            className={`bg-[#f4f7fb] text-slate-900 ${isFullscreen ? "h-[100dvh] overflow-hidden p-[clamp(2.5rem,4.25vw,5rem)]" : "min-h-screen p-4 sm:p-6 md:p-8 lg:p-10"}`}
        >
            <div className={`mx-auto ${isFullscreen ? "flex h-full max-w-none flex-col" : "max-w-7xl"}`}>
                <div className={`flex gap-3 ${isFullscreen ? "mb-2 items-center justify-end" : "mb-4 flex-col items-stretch sm:flex-row sm:items-center sm:justify-end"}`}>
                    {!isFullscreen && me?.role === "DOCTOR" && clinics.length > 1 ? (
                        <select
                            value={selectedClinicId ?? ""}
                            onChange={(event) => setSelectedClinicId(event.target.value ? Number(event.target.value) : null)}
                            className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none sm:w-auto"
                        >
                            {clinics.map((clinic) => (
                                <option key={clinic.clinic_id} value={clinic.clinic_id}>
                                    {clinic.clinic_name || `Clinic ${clinic.clinic_id}`}
                                </option>
                            ))}
                        </select>
                    ) : null}
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        className={`inline-flex items-center justify-center rounded-full font-semibold text-white sm:self-auto ${
                            isFullscreen
                                ? "bg-indigo-400 gap-1.5 px-3 py-1.5 text-xs"
                                : "bg-indigo-600 gap-2 px-4 py-2 text-sm"
                        }`}
                    >
                        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                        {isFullscreen ? "Exit Full Screen" : "Full Screen"}
                    </button>
                </div>

                <div className={`grid ${isFullscreen ? "min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,0.76fr)_minmax(0,1.28fr)_auto] gap-[clamp(0.45rem,1.1vh,0.8rem)]" : "gap-4 sm:gap-5"}`}>
                    <section className={`grid items-center rounded-[34px] bg-white ${isFullscreen ? "grid-cols-[minmax(0,1fr)_auto] gap-4 px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.7rem,1.4vh,1.1rem)]" : "grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 sm:px-6 sm:py-5"}`}>
                        <div className="flex min-w-0 items-center gap-4">
                            <Image
                                src="/dapto-logo.png"
                                alt="Dapto"
                                width={64}
                                height={64}
                                className={`${isFullscreen ? "h-[clamp(2.85rem,5.6vmin,4rem)] w-auto" : "h-16 w-auto"} shrink-0 object-contain`}
                                priority
                            />
                            <div className="min-w-0">
                                <div className={`${isFullscreen ? "text-[clamp(1rem,2.3vmin,1.5rem)]" : "text-[1.5rem]"} truncate font-semibold text-slate-800`}>{todayLabel}</div>
                                <div className={`${isFullscreen ? "mt-0.5 text-[clamp(0.75rem,1.45vmin,1rem)]" : "mt-1 text-[1rem]"} truncate font-medium text-slate-500`}>{scheduleLabel}</div>
                            </div>
                        </div>
                        <div className={`${isFullscreen ? "text-[clamp(1.15rem,2.7vmin,1.9rem)]" : "text-[1.3rem] sm:text-[1.6rem] lg:text-[1.9rem]"} font-bold text-slate-900 sm:text-right`}>{clock}</div>
                    </section>

                    <section className={`grid items-center ${isFullscreen ? "grid-cols-2 gap-6 px-[clamp(0.5rem,1.2vw,0.75rem)] py-0" : "grid-cols-1 gap-2 px-1 py-1 md:grid-cols-2 md:gap-6 md:px-3"}`}>
                        <div className="min-w-0">
                            <p className={`${isFullscreen ? "text-[clamp(1.25rem,3.4vmin,2.2rem)]" : "text-[1.4rem] sm:text-[1.8rem] lg:text-[2.2rem]"} truncate font-black leading-tight text-slate-900`}>
                                {formatDoctorName(liveData.doctor_name || selectedClinic?.doctor?.doctor_name || me?.name || "Doctor")}
                            </p>
                        </div>
                        <div className="min-w-0 md:text-right">
                            <p className={`${isFullscreen ? "text-[clamp(1.25rem,3.4vmin,2.2rem)]" : "text-[1.4rem] sm:text-[1.8rem] lg:text-[2.2rem]"} truncate font-black leading-tight text-slate-900`}>
                                {liveData.clinic_name || selectedClinic?.clinic_name || "Clinic"}
                            </p>
                        </div>
                    </section>

                    <section className={`grid min-h-0 rounded-[clamp(1.5rem,3vmin,2.375rem)] bg-white ${isFullscreen ? "grid-cols-2 gap-[clamp(0.5rem,1.5vw,1rem)] px-[clamp(0.75rem,1.7vw,1.25rem)] py-[clamp(0.4rem,1vh,0.75rem)]" : "grid-cols-1 gap-4 px-4 py-4 sm:px-5 md:grid-cols-2 md:gap-8 md:px-6"}`}>
                        <FocusCard label="Current" appointment={liveData.current} compact={isFullscreen} />
                        <FocusCard label="Next" appointment={liveData.next} compact={isFullscreen} />
                    </section>

                    <div className={`grid min-h-0 ${isFullscreen ? "grid-rows-2 gap-[clamp(0.45rem,1.1vh,0.8rem)] overflow-hidden" : "gap-4"}`}>
                        <RotatingAppointmentGrid title="Remaining" items={liveData.remaining} compact={isFullscreen} />
                        <RotatingAppointmentGrid title="Missed" items={liveData.missed} compact={isFullscreen} />
                    </div>

                    <section className={`overflow-hidden rounded-full bg-white/80 text-indigo-700 ${isFullscreen ? "px-4 py-[clamp(0.35rem,0.9vh,0.6rem)]" : "px-4 py-2.5 sm:px-5 sm:py-3"}`}>
                        <div className="flex w-max animate-[liveTicker_34s_linear_infinite] whitespace-nowrap text-[0.82rem] font-medium tracking-[0.04em] sm:text-[0.95rem] lg:text-[1.05rem]">
                            <span className="pr-24">{TICKER_MESSAGE}</span>
                            <span className="pr-24" aria-hidden="true">
                                {TICKER_MESSAGE}
                            </span>
                        </div>
                    </section>
                </div>
            </div>

            <style jsx global>{`
                @keyframes liveTicker {
                    from {
                        transform: translateX(0);
                    }
                    to {
                        transform: translateX(-50%);
                    }
                }
            `}</style>
        </div>
    );
}
