"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AlertCircle, Loader2, Maximize, Minimize } from "lucide-react";
import { buildScrollingLogoSequence, resolveSideAds, type LiveQueueSideAd, type QueueSideAdPosition } from "@/lib/liveQueueAds";

type QueueCard = {
    appointment_id: number;
    queue_number: number | null;
    patient_name: string;
    status: string;
    start_time_label: string;
};

type LiveSlide = {
    doctor_id: number;
    clinic_id: number;
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

type TvQueueResponse = {
    display_settings?: {
        remaining_slide_seconds?: number;
        missed_slide_seconds?: number;
        doctor_rotation_seconds?: number;
    };
    side_ads?: LiveQueueSideAd[];
    slides?: LiveSlide[];
};

type RotationCountdownState = {
    deadlineMs: number | null;
    animationKey: number;
};

const ROTATE_INTERVAL_MS = 8000;
const HOSPITAL_SLIDE_ROTATE_MS = 40000;
const DEFAULT_DISPLAY_TIMING_MS = {
    remainingSlideMs: ROTATE_INTERVAL_MS,
    doctorRotationMs: HOSPITAL_SLIDE_ROTATE_MS,
};
const TICKER_SEPARATOR = " \u2022 ";
const TICKER_MESSAGE = [
    "Please wait for your token number",
    "Keep your OPD slip ready",
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

const EMPTY_SLIDE: LiveSlide = {
    doctor_id: 0,
    clinic_id: 0,
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

function QueueSideAdPanel({
    side,
    ads,
}: {
    side: QueueSideAdPosition;
    ads: LiveQueueSideAd[];
}) {
    const sideAds = useMemo(() => resolveSideAds(ads, side), [ads, side]);
    const [activeVideoIndex, setActiveVideoIndex] = useState(0);

    if (sideAds.videos.length === 0 && sideAds.logos.length === 0) return null;

    const scrollingLogos = buildScrollingLogoSequence(sideAds.logos);
    const scrollingLogoItems = [...scrollingLogos, ...scrollingLogos];
    const logoScrollDurationSeconds = Math.max(scrollingLogos.length * 2.4, 18);
    const videoSignature = sideAds.videos.map((video) => video.ad_id).join(",");
    const activeVideo = sideAds.videos.length > 0 ? sideAds.videos[activeVideoIndex % sideAds.videos.length] : null;
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
            className="relative flex h-full overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(237,244,255,0.94))] shadow-[0_22px_54px_-30px_rgba(15,23,42,0.4)]"
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
    const isCurrent = label.toLowerCase() === "current";
    const numberColor = isCurrent ? "text-emerald-500" : "text-indigo-600";
    const number = appointment?.queue_number ? String(appointment.queue_number) : "--";

    return (
        <div className="flex min-h-0 flex-col items-center justify-center text-center">
            <p className={`${compact ? "text-[clamp(0.72rem,1.15vw,0.92rem)] tracking-[0.15em]" : "text-[1rem] tracking-[0.22em] sm:text-[1.15rem] lg:text-[1.3rem] lg:tracking-[0.28em]"} font-bold uppercase text-slate-500`}>{label}</p>
            <div className={`${compact ? "text-[clamp(2.6rem,7.2vmin,4.8rem)]" : "text-[clamp(3.6rem,16vw,6.5rem)] sm:text-[clamp(4.5rem,12vw,8rem)]"} font-black leading-none ${numberColor}`}>
                {number}
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

function RotationCountdown({
    remainingMs,
    totalMs,
}: {
    remainingMs: number;
    totalMs: number;
}) {
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const normalizedTotalMs = Math.max(1000, totalMs);
    const clampedRemainingMs = Math.max(0, Math.min(remainingMs, normalizedTotalMs));
    const displaySeconds = Math.max(0, Math.ceil(clampedRemainingMs / 1000));

    return (
        <div
            className="flex h-[clamp(3.5rem,7vmin,4.6rem)] w-[clamp(3.5rem,7vmin,4.6rem)] shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.98),rgba(255,247,237,0.94))] shadow-[0_18px_35px_-24px_rgba(249,115,22,0.55)] ring-1 ring-orange-100"
            aria-label={`Next doctor in ${displaySeconds} seconds`}
            title={`Next doctor in ${displaySeconds} seconds`}
        >
            <div className="relative h-[clamp(3rem,6.1vmin,4rem)] w-[clamp(3rem,6.1vmin,4rem)]">
                <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
                    <circle cx="36" cy="36" r={radius} fill="none" stroke="rgba(251, 191, 36, 0.16)" strokeWidth="6" />
                    <circle
                        cx="36"
                        cy="36"
                        r={radius}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset="0"
                        style={{ animation: `rotationCountdownStroke ${normalizedTotalMs}ms linear forwards` }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[clamp(0.95rem,2vmin,1.3rem)] font-black leading-none text-orange-500">{displaySeconds}</span>
                    <span className="mt-[1px] text-[clamp(0.34rem,0.78vmin,0.48rem)] font-bold uppercase tracking-[0.18em] text-slate-500">Sec</span>
                </div>
            </div>
        </div>
    );
}

function RemainingGrid({
    items,
    compact = false,
    rotateIntervalMs = ROTATE_INTERVAL_MS,
}: {
    items: QueueCard[];
    compact?: boolean;
    rotateIntervalMs?: number;
}) {
    const rowsPerColumn = compact ? 6 : 6;
    const pageSize = rowsPerColumn * 2;
    const pages = useMemo(() => splitIntoPages(items, pageSize), [items, pageSize]);
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
        }, rotateIntervalMs);

        return () => window.clearInterval(interval);
    }, [pages.length, rotateIntervalMs]);

    const normalizedPageIndex = pageIndex >= pages.length ? 0 : pageIndex % pages.length;
    const activePage = pages[normalizedPageIndex] || [];
    const columns = splitColumns(activePage, rowsPerColumn);
    const numberColumnClass = compact ? "grid-cols-[clamp(3.8rem,5.6vw,5rem)_minmax(0,1fr)]" : "grid-cols-[84px_minmax(0,1fr)] sm:grid-cols-[100px_minmax(0,1fr)]";
    const rowCardClass = compact
        ? "min-h-[clamp(1.9rem,3vh,2.45rem)] gap-[clamp(0.35rem,0.6vw,0.5rem)] px-[clamp(0.6rem,0.95vw,0.8rem)] py-[clamp(0.2rem,0.34vh,0.3rem)]"
        : "min-h-[56px] gap-2.5 px-3 sm:min-h-[64px] sm:px-3.5";
    const sectionPaddingClass = compact ? "px-[clamp(0.8rem,1.7vmin,1.1rem)] pb-[clamp(0.55rem,1vmin,0.75rem)] pt-[clamp(0.45rem,0.9vmin,0.65rem)]" : "p-3 sm:p-4 lg:p-5";
    const sectionHeaderClass = compact ? "mb-[clamp(0.2rem,0.45vh,0.32rem)]" : "mb-4";
    const sectionTitleClass = compact ? "text-[clamp(0.78rem,1.45vmin,1rem)] tracking-[0.18em]" : "text-[clamp(0.85rem,1.8vmin,1.15rem)] tracking-[0.24em]";
    const columnHeaderClass = compact
        ? "px-2 pb-0 text-[clamp(0.58rem,1vmin,0.78rem)] tracking-[0.11em]"
        : "px-3 pb-1.5 sm:px-3.5 sm:pb-2";

    const renderColumn = (columnItems: QueueCard[], columnKey: string) => (
        <div
            className={`grid min-h-0 ${compact ? "mx-auto w-full max-w-[24rem] gap-[clamp(0.24rem,0.5vh,0.38rem)]" : "gap-2"}`}
            style={{ gridTemplateRows: `auto repeat(${rowsPerColumn}, minmax(0, 1fr))` }}
        >
            <div className={`grid ${numberColumnClass} font-semibold uppercase text-slate-500 ${compact ? columnHeaderClass : `text-[clamp(0.62rem,1.15vmin,0.9rem)] tracking-[0.16em] ${columnHeaderClass}`}`}>
                <span>No.</span>
                <span>Patient Name</span>
            </div>
            {Array.from({ length: rowsPerColumn }).map((_, index) => {
                const appointment = columnItems[index];
                return (
                    <div
                        key={appointment ? appointment.appointment_id : `remaining-${columnKey}-${index}`}
                        className={`grid min-h-0 ${numberColumnClass} items-center rounded-[clamp(1rem,2vmin,1.5rem)] bg-white/75 ${rowCardClass}`}
                    >
                        {appointment ? (
                            <>
                                <div className={`${compact ? "text-[clamp(0.96rem,1.8vmin,1.28rem)] leading-none" : "text-[1.4rem] sm:text-[1.7rem]"} font-black text-indigo-600`}>
                                    {appointment.queue_number || "--"}
                                </div>
                                <div className="min-w-0">
                                    <p className={`truncate font-semibold text-slate-900 ${compact ? "text-[clamp(0.92rem,1.38vmin,1.1rem)] leading-tight" : "text-[1.08rem] sm:text-[1.16rem] lg:text-[1.26rem]"}`}>
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
        <section className={`flex min-h-0 flex-col overflow-hidden rounded-[clamp(1.35rem,3vmin,2.25rem)] border border-indigo-200 bg-indigo-50/55 text-indigo-500 ${sectionPaddingClass}`}>
            <div className={`flex shrink-0 items-center justify-between gap-3 ${sectionHeaderClass}`}>
                <h2 className={`${sectionTitleClass} font-black uppercase`}>Remaining</h2>
                {pages.length > 1 ? (
                    <div className={compact ? "text-[clamp(0.62rem,1vmin,0.8rem)] font-medium text-slate-400" : "text-sm font-medium text-slate-400"}>
                        {normalizedPageIndex + 1}/{pages.length}
                    </div>
                ) : null}
            </div>
            <div className={`grid min-h-0 flex-1 transition-opacity duration-300 ${compact ? "grid-cols-2 justify-center gap-[clamp(0.45rem,0.9vmin,0.8rem)]" : "grid-cols-1 gap-3 md:grid-cols-2 md:gap-4"} ${fading ? "opacity-0" : "opacity-100"}`}>
                {renderColumn(columns.left, "left")}
                {renderColumn(columns.right, "right")}
            </div>
        </section>
    );
}

export default function HmsTvDisplayClient({ compact = false }: { compact?: boolean }) {
    const fullscreenRef = useRef<HTMLDivElement | null>(null);
    const autoFullscreenAttemptedRef = useRef(false);
    const [liveData, setLiveData] = useState<LiveSlide>(EMPTY_SLIDE);
    const [slides, setSlides] = useState<LiveSlide[]>([]);
    const slidesRef = useRef<LiveSlide[]>([]);
    const [, setSlideIndex] = useState(0);
    const [slideFading, setSlideFading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [clock, setClock] = useState(() => formatISTClock(new Date()));
    const [todayLabel, setTodayLabel] = useState(() => formatISTDate(new Date()));
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [queueSideAds, setQueueSideAds] = useState<LiveQueueSideAd[]>([]);
    const [displayTimingMs, setDisplayTimingMs] = useState(DEFAULT_DISPLAY_TIMING_MS);
    const [rotationCountdownState, setRotationCountdownState] = useState<RotationCountdownState>({
        deadlineMs: null,
        animationKey: 0,
    });

    const loadQueue = useCallback(async () => {
        try {
            const res = await fetch("/api/hms/staff/tv-display/queue", { cache: "no-store" });
            const data: TvQueueResponse & { error?: string } = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Unable to load TV queue.");

            const displaySettings = data.display_settings || {};
            const nextDisplayTimingMs = {
                remainingSlideMs: Math.max(2000, Number(displaySettings.remaining_slide_seconds || 8) * 1000),
                doctorRotationMs: Math.max(5000, Number(displaySettings.doctor_rotation_seconds || 40) * 1000),
            };
            const nextSlides = Array.isArray(data.slides) ? data.slides : [];
            setDisplayTimingMs(nextDisplayTimingMs);
            slidesRef.current = nextSlides;
            setSlides(nextSlides);
            setQueueSideAds(Array.isArray(data.side_ads) ? data.side_ads : []);
            setSlideIndex((current) => {
                const nextIndex = nextSlides.length > 0 ? current % nextSlides.length : 0;
                setLiveData(nextSlides[nextIndex] || EMPTY_SLIDE);
                return nextIndex;
            });
            setRotationCountdownState((current) => {
                if (nextSlides.length <= 1) {
                    return current.deadlineMs ? { deadlineMs: null, animationKey: current.animationKey + 1 } : current;
                }

                const nowMs = Date.now();
                const remainingMs = current.deadlineMs ? current.deadlineMs - nowMs : 0;
                if (remainingMs <= 0 || remainingMs > nextDisplayTimingMs.doctorRotationMs) {
                    return {
                        deadlineMs: nowMs + nextDisplayTimingMs.doctorRotationMs,
                        animationKey: current.animationKey + 1,
                    };
                }

                return current;
            });
            setError("");
        } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : "Unable to load TV queue.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadQueue();
        const interval = window.setInterval(() => {
            if (document.visibilityState === "visible") void loadQueue();
        }, 5000);
        return () => window.clearInterval(interval);
    }, [loadQueue]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            const now = new Date();
            setClock(formatISTClock(now));
            setTodayLabel(formatISTDate(now));
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
        syncFullscreenState();
        document.addEventListener("fullscreenchange", syncFullscreenState);
        return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
    }, []);

    useEffect(() => {
        if (loading || isFullscreen || autoFullscreenAttemptedRef.current) return;
        autoFullscreenAttemptedRef.current = true;
        void fullscreenRef.current?.requestFullscreen().catch(() => undefined);
    }, [isFullscreen, loading]);

    useEffect(() => {
        if (slides.length <= 1) return;

        const interval = window.setInterval(() => {
            setSlideFading(true);
            window.setTimeout(() => {
                setSlideIndex((current) => {
                    const activeSlides = slidesRef.current;
                    const nextIndex = activeSlides.length > 0 ? (current + 1) % activeSlides.length : 0;
                    setLiveData(activeSlides[nextIndex] || EMPTY_SLIDE);
                    setRotationCountdownState((state) => ({
                        deadlineMs: Date.now() + displayTimingMs.doctorRotationMs,
                        animationKey: state.animationKey + 1,
                    }));
                    return nextIndex;
                });
                setSlideFading(false);
            }, 240);
        }, displayTimingMs.doctorRotationMs);

        return () => window.clearInterval(interval);
    }, [displayTimingMs.doctorRotationMs, slides.length]);

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await fullscreenRef.current?.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch {
            setError("Fullscreen mode is not available on this device.");
        }
    };

    const rotationTotalMs = displayTimingMs.doctorRotationMs;
    const [rotationRemainingMs, setRotationRemainingMs] = useState(rotationTotalMs);
    useEffect(() => {
        if (!rotationCountdownState.deadlineMs) {
            setRotationRemainingMs(rotationTotalMs);
            return;
        }
        const interval = window.setInterval(() => {
            setRotationRemainingMs(Math.max(0, Number(rotationCountdownState.deadlineMs) - Date.now()));
        }, 250);
        return () => window.clearInterval(interval);
    }, [rotationCountdownState.deadlineMs, rotationTotalMs]);

    const hasLeftAds = resolveSideAds(queueSideAds, "LEFT").videos.length > 0 || resolveSideAds(queueSideAds, "LEFT").logos.length > 0;
    const hasRightAds = resolveSideAds(queueSideAds, "RIGHT").videos.length > 0 || resolveSideAds(queueSideAds, "RIGHT").logos.length > 0;
    const showSideAds = hasLeftAds || hasRightAds;
    const boardWidth = showSideAds ? FULLSCREEN_BOARD_COMPRESSED_WIDTH : FULLSCREEN_BOARD_BASE_WIDTH;
    const doctorDisplayName = formatDoctorName(liveData.doctor_name);
    const doctorMeta = String(liveData.doctor_education || "").trim();
    const showRotationCountdown = slides.length > 1 && Boolean(rotationCountdownState.deadlineMs);

    if (loading && !error) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div
            ref={fullscreenRef}
            className={`${compact && !isFullscreen ? "min-h-[calc(100vh-2rem)]" : "h-[100dvh]"} relative overflow-hidden bg-[#f4f7fb] py-[clamp(0.85rem,1.8vh,1.5rem)] text-slate-900`}
            style={{ paddingInline: SCREEN_EDGE_GAP }}
        >
            <div className="mx-auto flex h-full w-full max-w-[calc(1020px+calc(16rem*2)+4rem)] flex-col">
                <div className="mx-auto mb-2 flex items-center justify-end gap-3" style={{ width: boardWidth }}>
                    {error ? (
                        <div className="mr-auto flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                            <AlertCircle size={13} />
                            {error}
                        </div>
                    ) : null}
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="inline-flex items-center justify-center gap-1 rounded-full bg-indigo-500 px-2 py-1 text-[10px] font-semibold text-white"
                    >
                        {isFullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
                        {isFullscreen ? "Exit Full Screen" : "Enter Fullscreen"}
                    </button>
                </div>

                <section
                    className="mx-auto mb-[clamp(0.3rem,0.8vh,0.6rem)] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[34px] bg-white px-[clamp(0.65rem,1.25vw,0.95rem)] py-[clamp(0.3rem,0.65vh,0.5rem)] shadow-[0_22px_50px_-35px_rgba(15,23,42,0.35)]"
                    style={{ width: boardWidth }}
                >
                    <div className="flex min-w-0 items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/dapto-logo.png"
                            alt="Dapto"
                            className="h-[clamp(2.85rem,5.6vmin,4rem)] w-auto shrink-0 object-contain"
                        />
                        <div className="min-w-0">
                            <div className="truncate text-[clamp(0.86rem,1.7vmin,1.15rem)] font-semibold text-slate-800">{todayLabel}</div>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-[clamp(0.55rem,1.2vmin,0.9rem)] sm:text-right">
                        <div className="text-[clamp(0.95rem,2vmin,1.35rem)] font-bold text-slate-900">{clock}</div>
                        {showRotationCountdown ? (
                            <RotationCountdown
                                key={rotationCountdownState.animationKey}
                                remainingMs={rotationRemainingMs}
                                totalMs={rotationTotalMs}
                            />
                        ) : null}
                    </div>
                </section>

                <div
                    className="grid min-h-0 flex-1 items-stretch justify-center gap-x-[clamp(0.7rem,1.2vw,1rem)]"
                    style={{
                        gridTemplateColumns: showSideAds
                            ? `${LEFT_SIDE_PANEL_WIDTH} ${boardWidth} ${RIGHT_SIDE_PANEL_WIDTH}`
                            : boardWidth,
                    }}
                >
                    {showSideAds ? (
                        <div className="min-h-0">
                            {hasLeftAds ? <QueueSideAdPanel side="LEFT" ads={queueSideAds} /> : <div aria-hidden="true" className="h-full w-full" />}
                        </div>
                    ) : null}

                    <div className={`grid h-full min-h-0 w-full grid-rows-[auto_auto_minmax(240px,1.6fr)] gap-[clamp(0.3rem,0.8vh,0.6rem)] transition-opacity duration-300 ${slideFading ? "opacity-0" : "opacity-100"}`}>
                        <section className="grid grid-cols-2 items-start gap-6 px-[clamp(0.9rem,1.8vw,1.5rem)] py-0">
                            <div className="min-w-0">
                                <p className="whitespace-nowrap text-[clamp(1rem,2.4vmin,1.5rem)] leading-tight text-slate-900">
                                    <span className="font-black">{doctorDisplayName}</span>
                                    {doctorMeta ? <span className="ml-2 inline whitespace-nowrap text-[0.56em] font-normal text-slate-500">{doctorMeta}</span> : null}
                                </p>
                            </div>
                            <div className="min-w-0 md:text-right">
                                <p className="truncate text-[clamp(1rem,2.4vmin,1.5rem)] font-black leading-tight text-slate-900">
                                    {liveData.clinic_name || "Hospital"}
                                </p>
                            </div>
                        </section>

                        <section className="grid grid-cols-2 items-start gap-[clamp(0.8rem,1.6vw,1.15rem)] rounded-[clamp(1.3rem,2.4vmin,1.9rem)] bg-white px-[clamp(0.9rem,1.7vw,1.25rem)] pb-[clamp(0.35rem,0.7vh,0.5rem)] pt-[clamp(0.2rem,0.45vh,0.3rem)] shadow-[0_22px_50px_-35px_rgba(15,23,42,0.35)]">
                            <FocusCard label="Current" appointment={liveData.current} compact />
                            <FocusCard label="Next" appointment={liveData.next} compact />
                        </section>

                        <div className="grid min-h-0 overflow-hidden">
                            <RemainingGrid items={liveData.remaining} compact rotateIntervalMs={displayTimingMs.remainingSlideMs} />
                        </div>
                    </div>

                    {showSideAds ? (
                        <div className="min-h-0">
                            {hasRightAds ? <QueueSideAdPanel side="RIGHT" ads={queueSideAds} /> : <div aria-hidden="true" className="h-full w-full" />}
                        </div>
                    ) : null}
                </div>

                <section
                    className="mx-auto mt-[clamp(0.3rem,0.8vh,0.6rem)] overflow-hidden rounded-full bg-white/80 px-3 py-[clamp(0.2rem,0.5vh,0.35rem)] text-indigo-700"
                    style={{ width: boardWidth }}
                >
                    <div className="flex w-max animate-[liveTicker_34s_linear_infinite] whitespace-nowrap text-[0.68rem] font-medium tracking-[0.04em]">
                        <span className="pr-24">{TICKER_MESSAGE}</span>
                        <span className="pr-24" aria-hidden="true">{TICKER_MESSAGE}</span>
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

                @keyframes rotationCountdownStroke {
                    from {
                        stroke-dashoffset: 0;
                    }
                    to {
                        stroke-dashoffset: ${2 * Math.PI * 30};
                    }
                }
            `}</style>
        </div>
    );
}
