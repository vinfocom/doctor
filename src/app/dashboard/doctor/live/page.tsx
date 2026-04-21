"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Maximize, Minimize } from "lucide-react";
import { convertTo12Hour, formatTime } from "@/lib/timeUtils";
import { buildScrollingLogoSequence, resolveSideAds, type LiveQueueSideAd, type QueueSideAdPosition } from "@/lib/liveQueueAds";

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
        education?: string | null;
        specialization?: string | null;
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
    doctor_education?: string;
    doctor_specialization?: string;
    clinic_name: string;
    selected_clinic_id: number | null;
    today_label: string;
    now_label: string;
    schedule_label?: string;
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
    doctor_education: "",
    doctor_specialization: "",
    clinic_name: "",
    selected_clinic_id: null,
    today_label: "",
    now_label: "",
    schedule_label: "",
    current: null,
    next: null,
    missed: [],
    remaining: [],
    total_today: 0,
};

const ROTATE_INTERVAL_MS = 10000;
const ADS_REFRESH_INTERVAL_MS = 5000;
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
const FULLSCREEN_BOARD_WIDTH = 1020;
const LEFT_SIDE_PANEL_WIDTH = `clamp(10rem, calc((100vw - ${FULLSCREEN_BOARD_WIDTH}px - 1.8rem) / 2), 17rem)`;
const RIGHT_SIDE_PANEL_WIDTH = LEFT_SIDE_PANEL_WIDTH;
const SCREEN_EDGE_GAP = "clamp(0.75rem, 1.4vw, 1.25rem)";
const FULLSCREEN_BOARD_BASE_WIDTH = `min(680px, calc(100vw - (2 * ${SCREEN_EDGE_GAP}) - 12rem))`;
const FULLSCREEN_BOARD_COMPRESSED_WIDTH = `min(960px, calc(100vw - (2 * ${SCREEN_EDGE_GAP}) - (2 * ${LEFT_SIDE_PANEL_WIDTH}) - 2.4rem))`;

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

function formatDoctorMeta(education: string | null | undefined, specialization: string | null | undefined) {
    const cleanedEducation = String(education || "").trim();
    const cleanedSpecialization = String(specialization || "").trim();

    if (!cleanedEducation && !cleanedSpecialization) {
        return "";
    }

    if (cleanedEducation && cleanedSpecialization) {
        return `${cleanedEducation} (${cleanedSpecialization})`;
    }

    return cleanedEducation || `(${cleanedSpecialization})`;
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

function QueueSideAdPanel({
    side,
    ads,
    className = "",
}: {
    side: QueueSideAdPosition;
    ads: LiveQueueSideAd[];
    className?: string;
}) {
    const sideAds = useMemo(() => resolveSideAds(ads, side), [ads, side]);
    const [activeVideoIndex, setActiveVideoIndex] = useState(0);

    if (sideAds.videos.length === 0 && sideAds.logos.length === 0) {
        return null;
    }

    const scrollingLogos = buildScrollingLogoSequence(sideAds.logos);
    const scrollingLogoItems = [...scrollingLogos, ...scrollingLogos];
    const logoScrollDurationSeconds = Math.max(scrollingLogos.length * 2.4, 18);
    const videoSignature = sideAds.videos.map((video) => video.ad_id).join(",");
    const activeVideo =
        sideAds.videos.length > 0
            ? sideAds.videos[activeVideoIndex % sideAds.videos.length]
            : null;
    const handleVideoEnded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
        if (sideAds.videos.length <= 1) {
            event.currentTarget.currentTime = 0;
            void event.currentTarget.play().catch(() => undefined);
            return;
        }

        setActiveVideoIndex((current) => (current + 1) % sideAds.videos.length);
    };

    return (
        <aside
            key={`${side}-${videoSignature}`}
            className={`relative flex h-full overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(237,244,255,0.94))] shadow-[0_22px_54px_-30px_rgba(15,23,42,0.4)] ${className}`}
            style={{ width: side === "LEFT" ? LEFT_SIDE_PANEL_WIDTH : RIGHT_SIDE_PANEL_WIDTH }}
        >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white via-white/85 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#edf4ff] via-[#edf4ff]/90 to-transparent" />

            {activeVideo ? (
                <div className="relative z-10 flex min-h-0 flex-1 px-[clamp(0.55rem,0.9vw,0.75rem)] py-[clamp(0.55rem,0.9vw,0.75rem)]">
                    <div className="relative h-full w-full overflow-hidden rounded-[1.6rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),rgba(15,23,42,0.08))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                        <video
                            key={activeVideo.ad_id}
                            src={activeVideo.asset_url}
                            className="absolute left-1/2 top-1/2 h-full min-h-full w-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover object-center"
                            autoPlay
                            muted
                            playsInline
                            preload="auto"
                            disableRemotePlayback
                            controlsList="noremoteplayback"
                            onEnded={handleVideoEnded}
                        />
                    </div>
                </div>
            ) : (
                <div className="relative z-10 min-h-0 flex-1 overflow-hidden px-3 py-3">
                    <div className="relative h-full overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/78 px-3 py-4 shadow-[0_18px_40px_-28px_rgba(37,99,235,0.4)]">
                        <div
                            className="flex animate-[queueAdScrollDown_linear_infinite] flex-col items-center gap-4 will-change-transform"
                            style={{ animationDuration: `${logoScrollDurationSeconds}s` }}
                        >
                            {scrollingLogoItems.map((logo, index) => (
                                <div
                                    key={`${logo.ad_id}-${index}`}
                                    className="flex w-full items-center justify-center rounded-[1.15rem] bg-white/95 px-3 py-4 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.55)]"
                                >
                                    <Image
                                        src={logo.asset_url}
                                        alt={logo.title || "Sponsor logo"}
                                        width={150}
                                        height={90}
                                        className="h-auto max-h-[4.8rem] w-full object-contain"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
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
        <div className={`flex min-h-0 flex-col items-center justify-center text-center ${compact ? "gap-[clamp(0.45rem,0.85vh,0.8rem)] px-[clamp(0.9rem,1.8vw,1.7rem)] py-[clamp(0.35rem,0.7vh,0.55rem)]" : "min-h-[200px] gap-3 px-4 py-5 sm:min-h-[240px] sm:gap-4"}`}>
            <p className={`${compact ? "text-[clamp(0.72rem,1.15vw,0.92rem)] tracking-[0.15em]" : "text-[1rem] tracking-[0.22em] sm:text-[1.15rem] lg:text-[1.3rem] lg:tracking-[0.28em]"} font-bold uppercase text-slate-500`}>{label}</p>
            <div className={`${compact ? "text-[clamp(2.6rem,7.2vmin,4.8rem)]" : "text-[clamp(3.6rem,16vw,6.5rem)] sm:text-[clamp(4.5rem,12vw,8rem)]"} font-black leading-none ${numberColor}`}>
                {appointment?.queue_number ?? "--"}
            </div>
            <p
                className={`font-semibold text-slate-900 ${compact ? "max-w-[min(100%,32rem)] text-[clamp(0.95rem,1.65vmin,1.35rem)] leading-[1.12]" : "max-w-full text-[1rem] sm:text-[1.15rem] lg:text-[clamp(1.15rem,2.5vw,2rem)]"}`}
                style={compact ? {
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textWrap: "balance",
                } : undefined}
            >
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

    const numberColumnClass = compact ? "grid-cols-[clamp(3.4rem,5vw,4.6rem)_minmax(0,1fr)]" : "grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[88px_minmax(0,1fr)]";
    const rowCardClass = compact
        ? "min-h-[clamp(1.5rem,2.4vh,2rem)] gap-[clamp(0.3rem,0.5vw,0.45rem)] px-[clamp(0.5rem,0.8vw,0.7rem)] py-[clamp(0.15rem,0.28vh,0.24rem)]"
        : "min-h-[48px] gap-2 px-2.5 sm:min-h-[56px] sm:px-3";
    const sectionPaddingClass = compact ? "px-[clamp(0.8rem,1.7vmin,1.1rem)] pb-[clamp(0.35rem,0.7vmin,0.55rem)] pt-[clamp(0.35rem,0.8vmin,0.55rem)]" : "p-3 sm:p-4 lg:p-5";
    const sectionHeaderClass = compact ? "mb-[clamp(0.1rem,0.28vh,0.2rem)]" : "mb-4";
    const sectionTitleClass = compact ? "text-[clamp(0.78rem,1.45vmin,1rem)] tracking-[0.18em]" : "text-[clamp(0.85rem,1.8vmin,1.15rem)] tracking-[0.24em]";
    const columnHeaderClass = compact
        ? "px-2 pb-0 text-[clamp(0.52rem,0.9vmin,0.72rem)] tracking-[0.11em]"
        : "px-2.5 pb-1.5 sm:px-3 sm:pb-2";

    const renderColumn = (columnItems: QueueCard[], columnKey: string) => (
        <div
                className={`grid min-h-0 ${compact ? "mx-auto w-full max-w-[24rem] gap-[clamp(0.24rem,0.5vh,0.38rem)]" : "gap-2"}`}
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
                                    <p className={`truncate font-semibold text-slate-900 ${compact ? "text-[clamp(0.82rem,1.24vmin,1rem)] leading-tight" : "text-[1rem] sm:text-[1.08rem] lg:text-[1.18rem]"}`}>
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
                className={`grid min-h-0 flex-1 transition-opacity duration-300 ${compact ? "grid-cols-2 justify-center gap-[clamp(0.45rem,0.9vmin,0.8rem)]" : "grid-cols-1 gap-3 md:grid-cols-2 md:gap-4"} ${fading ? "opacity-0" : "opacity-100"}`}
            >
                {renderColumn(columns.left, "left")}
                {renderColumn(columns.right, "right")}
            </div>
        </section>
    );
}

export default function LiveAppointmentsPage() {
    const router = useRouter();
    const fullscreenRef = useRef<HTMLDivElement | null>(null);
    const staffExitRedirectArmedRef = useRef(false);
    const staffAutoFullscreenAttemptedRef = useRef(false);
    const [me, setMe] = useState<MeResponse["user"] | null>(null);
    const [clinics, setClinics] = useState<ClinicOption[]>([]);
    const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
    const [liveData, setLiveData] = useState<LiveResponse>(EMPTY_STATE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [clock, setClock] = useState(() => formatISTClock(new Date()));
    const [todayLabel, setTodayLabel] = useState(() => formatISTDate(new Date()));
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [queueSideAds, setQueueSideAds] = useState<LiveQueueSideAd[]>([]);

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
            const isCurrentlyFullscreen = Boolean(document.fullscreenElement);
            setIsFullscreen(isCurrentlyFullscreen);

            if (me?.role === "CLINIC_STAFF") {
                if (isCurrentlyFullscreen) {
                    staffExitRedirectArmedRef.current = true;
                } else if (staffExitRedirectArmedRef.current) {
                    staffExitRedirectArmedRef.current = false;
                    router.push("/dashboard/doctor");
                }
            }
        };

        syncFullscreenState();
        document.addEventListener("fullscreenchange", syncFullscreenState);

        return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
    }, [me?.role, router]);

    useEffect(() => {
        if (me?.role !== "CLINIC_STAFF" || loading || isFullscreen || staffAutoFullscreenAttemptedRef.current) {
            return;
        }

        staffAutoFullscreenAttemptedRef.current = true;

        const enterFullscreenForStaff = async () => {
            try {
                await fullscreenRef.current?.requestFullscreen();
            } catch {
                setError("");
            }
        };

        void enterFullscreenForStaff();
    }, [isFullscreen, loading, me?.role]);

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
            setQueueSideAds([]);
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

    useEffect(() => {
        if (!selectedClinicId) {
            setQueueSideAds([]);
            return;
        }

        let cancelled = false;

        const loadQueueAds = async () => {
            try {
                const searchParams = new URLSearchParams({
                    clinicId: String(selectedClinicId),
                    t: String(Date.now()),
                });

                const res = await fetch(`/api/live-queue-ads?${searchParams.toString()}`, {
                    cache: "no-store",
                });

                if (!res.ok) {
                    const body = await res.json().catch(() => null);
                    throw new Error(body?.error || "Failed to load queue ads.");
                }

                const data = await res.json();
                if (!cancelled) {
                    setQueueSideAds(Array.isArray(data.ads) ? data.ads : []);
                }
            } catch (caughtError) {
                if (!cancelled) {
                    console.error("Failed to load queue ads:", caughtError);
                    setQueueSideAds([]);
                }
            }
        };

        loadQueueAds();

        const interval = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                loadQueueAds();
            }
        }, ADS_REFRESH_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [selectedClinicId]);

    const selectedClinic = useMemo(
        () => clinics.find((clinic) => clinic.clinic_id === selectedClinicId) || null,
        [clinics, selectedClinicId]
    );

    const scheduleLabel = useMemo(
        () => liveData.schedule_label || buildScheduleLabel(selectedClinic, new Date()),
        [liveData.schedule_label, selectedClinic]
    );
    const doctorDisplayName = useMemo(
        () => formatDoctorName(liveData.doctor_name || selectedClinic?.doctor?.doctor_name || me?.name || "Doctor"),
        [liveData.doctor_name, selectedClinic?.doctor?.doctor_name, me?.name]
    );
    const doctorMeta = useMemo(
        () =>
            formatDoctorMeta(
                liveData.doctor_education || selectedClinic?.doctor?.education,
                liveData.doctor_specialization || selectedClinic?.doctor?.specialization
            ),
        [
            liveData.doctor_education,
            liveData.doctor_specialization,
            selectedClinic?.doctor?.education,
            selectedClinic?.doctor?.specialization,
        ]
    );
    const leftSideAds = useMemo(() => resolveSideAds(queueSideAds, "LEFT"), [queueSideAds]);
    const rightSideAds = useMemo(() => resolveSideAds(queueSideAds, "RIGHT"), [queueSideAds]);
    const hasLeftFullscreenSideAds = Boolean(leftSideAds.videos.length > 0 || leftSideAds.logos.length > 0);
    const hasRightFullscreenSideAds = Boolean(rightSideAds.videos.length > 0 || rightSideAds.logos.length > 0);
    const hasFullscreenSideAds = Boolean(
        hasLeftFullscreenSideAds || hasRightFullscreenSideAds
    );
    const showFullscreenSideAds = isFullscreen && hasFullscreenSideAds;
    const fullscreenBoardWidth = showFullscreenSideAds ? FULLSCREEN_BOARD_COMPRESSED_WIDTH : FULLSCREEN_BOARD_BASE_WIDTH;

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

    if (isFullscreen) {
        return (
            <div
                ref={fullscreenRef}
                className="relative h-[100dvh] overflow-hidden bg-[#f4f7fb] py-[clamp(0.85rem,1.8vh,1.5rem)] text-slate-900"
                style={{ paddingInline: SCREEN_EDGE_GAP }}
            >
                <div className="mx-auto flex h-full w-full max-w-[calc(1020px+calc(16rem*2)+4rem)] flex-col">
                    <div className="mx-auto mb-2 flex items-center justify-end gap-3" style={{ width: fullscreenBoardWidth }}>
                        <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="inline-flex items-center justify-center gap-1 rounded-full bg-indigo-400 px-2 py-1 text-[10px] font-semibold text-white"
                        >
                            <Minimize size={12} />
                            Exit Full Screen
                        </button>
                    </div>

                    <section
                        className="mx-auto mb-[clamp(0.3rem,0.8vh,0.6rem)] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[34px] bg-white px-[clamp(0.65rem,1.25vw,0.95rem)] py-[clamp(0.3rem,0.65vh,0.5rem)] shadow-[0_22px_50px_-35px_rgba(15,23,42,0.35)]"
                        style={{ width: fullscreenBoardWidth }}
                    >
                        <div className="flex min-w-0 items-center gap-2.5">
                            <Image
                                src="/dapto-logo.png"
                                alt="Dapto"
                                width={64}
                                height={64}
                                className="h-[clamp(2.85rem,5.6vmin,4rem)] w-auto shrink-0 object-contain"
                                priority
                            />
                            <div className="min-w-0">
                                <div className="truncate text-[clamp(0.86rem,1.7vmin,1.15rem)] font-semibold text-slate-800">{todayLabel}</div>
                                <div className="mt-[1px] truncate text-[clamp(0.62rem,1.05vmin,0.82rem)] font-semibold text-slate-900">{scheduleLabel}</div>
                            </div>
                        </div>
                        <div className="text-[clamp(0.95rem,2vmin,1.35rem)] font-bold text-slate-900 sm:text-right">{clock}</div>
                    </section>

                    <div className="grid min-h-0 flex-1 items-stretch justify-center gap-x-[clamp(0.7rem,1.2vw,1rem)]"
                        style={{
                            gridTemplateColumns: showFullscreenSideAds
                                ? `${LEFT_SIDE_PANEL_WIDTH} ${fullscreenBoardWidth} ${RIGHT_SIDE_PANEL_WIDTH}`
                                : fullscreenBoardWidth,
                        }}
                    >
                        {showFullscreenSideAds ? (
                            <div className="min-h-0">
                                {hasLeftFullscreenSideAds ? (
                                    <QueueSideAdPanel side="LEFT" ads={queueSideAds} />
                                ) : (
                                    <div aria-hidden="true" className="h-full w-full" />
                                )}
                            </div>
                        ) : null}

                        <div className="grid h-full min-h-0 w-full grid-rows-[auto_auto_minmax(240px,1.6fr)] gap-[clamp(0.3rem,0.8vh,0.6rem)]">
                            <section className="grid grid-cols-2 items-start gap-6 px-[clamp(0.9rem,1.8vw,1.5rem)] py-0">
                                <div className="min-w-0">
                                    <p className="whitespace-nowrap text-[clamp(1rem,2.4vmin,1.5rem)] leading-tight text-slate-900">
                                        <span className="font-black">{doctorDisplayName}</span>
                                        {doctorMeta ? <span className="ml-2 inline whitespace-nowrap text-[0.56em] font-normal text-slate-500">{doctorMeta}</span> : null}
                                    </p>
                                </div>
                                <div className="min-w-0 md:text-right">
                                    <p className="truncate text-[clamp(1rem,2.4vmin,1.5rem)] font-black leading-tight text-slate-900">
                                        {liveData.clinic_name || selectedClinic?.clinic_name || "Clinic"}
                                    </p>
                                </div>
                            </section>

                            <section className="grid grid-cols-2 items-start gap-[clamp(0.8rem,1.6vw,1.15rem)] rounded-[clamp(1.3rem,2.4vmin,1.9rem)] bg-white px-[clamp(0.9rem,1.7vw,1.25rem)] pb-[clamp(0.35rem,0.7vh,0.5rem)] pt-[clamp(0.2rem,0.45vh,0.3rem)] shadow-[0_22px_50px_-35px_rgba(15,23,42,0.35)]">
                                <FocusCard label="Current" appointment={liveData.current} compact />
                                <FocusCard label="Next" appointment={liveData.next} compact />
                            </section>

                            <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-[clamp(0.28rem,0.7vh,0.5rem)] overflow-hidden">
                                <RotatingAppointmentGrid title="Remaining" items={liveData.remaining} compact />
                                <RotatingAppointmentGrid title="Missed" items={liveData.missed} compact />
                            </div>
                        </div>

                        {showFullscreenSideAds ? (
                            <div className="min-h-0">
                                {hasRightFullscreenSideAds ? (
                                    <QueueSideAdPanel side="RIGHT" ads={queueSideAds} />
                                ) : (
                                    <div aria-hidden="true" className="h-full w-full" />
                                )}
                            </div>
                        ) : null}
                    </div>

                    <section
                        className="mx-auto mt-[clamp(0.3rem,0.8vh,0.6rem)] overflow-hidden rounded-full bg-white/80 px-3 py-[clamp(0.2rem,0.5vh,0.35rem)] text-indigo-700"
                        style={{ width: fullscreenBoardWidth }}
                    >
                        <div className="flex w-max animate-[liveTicker_34s_linear_infinite] whitespace-nowrap text-[0.68rem] font-medium tracking-[0.04em]">
                            <span className="pr-24">{TICKER_MESSAGE}</span>
                            <span className="pr-24" aria-hidden="true">
                                {TICKER_MESSAGE}
                            </span>
                        </div>
                    </section>
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

                    @keyframes queueAdScrollDown {
                        from {
                            transform: translateY(-50%);
                        }
                        to {
                            transform: translateY(0);
                        }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div
            ref={fullscreenRef}
            className="min-h-screen bg-[#f4f7fb] p-4 text-slate-900 sm:p-6 md:p-8 lg:p-10"
        >
            <div className="mx-auto max-w-7xl">
                <div className="w-full">
                    <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
                        {me?.role === "DOCTOR" && clinics.length > 1 ? (
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
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white sm:self-auto"
                        >
                            <Maximize size={16} />
                            Full Screen
                        </button>
                    </div>

                    <div className="grid gap-4 sm:gap-5">
                        <section className="grid grid-cols-1 items-center gap-3 rounded-[34px] bg-white px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 sm:px-6 sm:py-5">
                            <div className="flex min-w-0 items-center gap-4">
                                <Image
                                    src="/dapto-logo.png"
                                    alt="Dapto"
                                    width={64}
                                    height={64}
                                    className="h-16 w-auto shrink-0 object-contain"
                                    priority
                                />
                                <div className="min-w-0">
                                    <div className="truncate text-[1.5rem] font-semibold text-slate-800">{todayLabel}</div>
                                    <div className="mt-1 truncate text-[1rem] font-semibold text-slate-900">{scheduleLabel}</div>
                                </div>
                            </div>
                            <div className="text-[1.3rem] font-bold text-slate-900 sm:text-right sm:text-[1.6rem] lg:text-[1.9rem]">{clock}</div>
                        </section>

                        <section className="grid grid-cols-1 items-start gap-2 px-1 py-1 md:grid-cols-2 md:gap-6 md:px-3">
                            <div className="min-w-0">
                                <p className="whitespace-nowrap text-[1.4rem] leading-tight text-slate-900 sm:text-[1.8rem] lg:text-[2.2rem]">
                                    <span className="font-black">{doctorDisplayName}</span>
                                    {doctorMeta ? <span className="ml-3 inline whitespace-nowrap text-[0.56em] font-normal text-slate-500">{doctorMeta}</span> : null}
                                </p>
                            </div>
                            <div className="min-w-0 md:text-right">
                                <p className="truncate text-[1.4rem] font-black leading-tight text-slate-900 sm:text-[1.8rem] lg:text-[2.2rem]">
                                    {liveData.clinic_name || selectedClinic?.clinic_name || "Clinic"}
                                </p>
                            </div>
                        </section>

                        <section className="grid min-h-0 grid-cols-1 gap-4 rounded-[clamp(1.3rem,2.4vmin,1.9rem)] bg-white px-4 py-4 sm:px-5 md:grid-cols-2 md:gap-8 md:px-6">
                            <FocusCard label="Current" appointment={liveData.current} />
                            <FocusCard label="Next" appointment={liveData.next} />
                        </section>

                        <div className="grid min-h-0 gap-4">
                            <RotatingAppointmentGrid title="Remaining" items={liveData.remaining} />
                            <RotatingAppointmentGrid title="Missed" items={liveData.missed} />
                        </div>

                        <section className="overflow-hidden rounded-full bg-white/80 px-4 py-2.5 text-indigo-700 sm:px-5 sm:py-3">
                            <div className="flex w-max animate-[liveTicker_34s_linear_infinite] whitespace-nowrap text-[0.82rem] font-medium tracking-[0.04em] sm:text-[0.95rem] lg:text-[1.05rem]">
                                <span className="pr-24">{TICKER_MESSAGE}</span>
                                <span className="pr-24" aria-hidden="true">
                                    {TICKER_MESSAGE}
                                </span>
                            </div>
                        </section>
                    </div>
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

                @keyframes queueAdScrollDown {
                    from {
                        transform: translateY(-50%);
                    }
                    to {
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}
