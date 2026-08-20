"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import Link from "next/link";
import EmrPrintablePrescriptionView, { LANGUAGE_OPTIONS, type PrintLanguage } from "@/components/emr/EmrPrintablePrescriptionView";
import type { EmrLayoutMarginConfig, EmrPrintablePrescription } from "@/lib/emr/types";
import { useStableDocumentTitle } from "@/lib/useStableDocumentTitle";

type HmsPrintType = "HEADER" | "INVESTIGATION_REQUEST" | "CONSULTATION" | "REGISTRATION_SLIP" | "PRESCRIPTION";

type HmsSharedPaperPrintViewProps = {
    event: {
        event_id: number;
        print_type: HmsPrintType;
        start_offset_mm: number;
    };
    visit: {
        visit_id: number;
        visit_number: string | null;
        daily_token_number?: number | null;
        visit_date: Date | string;
        visit_type: string;
        status: string;
        fee_charged: string | number | null;
        patient_name: string | null;
        patient_uhid: string | null;
        patient_phone: string | null;
        age: number | null;
        gender: string | null;
        doctor_name: string | null;
        referred_by_doctor_name?: string | null;
        room_no: string | null;
        hospital_name: string;
        hospital_group_code: string;
    };
    prescription: {
        id: number;
        status: string;
        finalized_at: Date | string | null;
        tests?: Array<{
            test_name: string;
            notes: string | null;
            sort_order: number;
        }>;
    } | null;
    printablePrescription?: EmrPrintablePrescription | null;
    omitTests?: boolean;
    pageMargins?: Partial<EmrLayoutMarginConfig> | null;
    headerConfig?: {
        reception_header?: Record<string, unknown> & {
            show_uhid?: boolean;
            show_opd?: boolean;
            show_room_no?: boolean;
            show_name?: boolean;
            show_age_sex?: boolean;
            show_fee?: boolean;
            show_mobile_no?: boolean;
            show_visited_on?: boolean;
            show_printed_on?: boolean;
            title_font_size_px?: number;
            body_font_size_px?: number;
        };
    } | null;
    showDoctorToken?: boolean;
    backHref: string;
    documentTitlePrefix?: "Rx" | "OPD Slip";
};

const PX_TO_MM = 25.4 / 96;
const DEFAULT_MARGIN_CONFIG: EmrLayoutMarginConfig = {
    top: "24px",
    right: "24px",
    bottom: "24px",
    left: "24px",
    unit: "mm",
    paper_preset: "blank_a4",
    offset_x: "0mm",
    offset_y: "0mm",
    header_space: "0mm",
    footer_space: "0mm",
    left_strip_space: "0mm",
    right_strip_space: "0mm",
    show_header_image: true,
    show_footer_image: true,
    show_clinic_logo: true,
    show_signature: true,
    show_prescription_number: false,
    show_prescription_validity: false,
    prescription_validity_value: null,
    prescription_validity_unit: "month",
    preprinted_scan_url: null,
};

function toDateLabel(value: Date | string | null | undefined) {
    if (!value) return "-";
    const text = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
    return text.split("-").reverse().join("/");
}

function formatFee(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === "") return "-";
    const amount = Number(value);
    if (!Number.isFinite(amount)) return String(value);
    return amount.toLocaleString("en-IN", {
        minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    });
}

function getPrintedOnLabel() {
    return new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function HeaderField({
    label,
    value,
    align = "left",
}: {
    label: string;
    value: string | number | null | undefined;
    align?: "left" | "right";
}) {
    const displayValue = value === null || value === undefined || value === "" ? "-" : value;

    return (
        <div className={`flex min-w-0 items-baseline gap-1 ${align === "right" ? "justify-end text-right" : "justify-start text-left"}`}>
            <span className="shrink-0 whitespace-nowrap font-semibold text-black">{label}:</span>
            <span className="min-w-0 break-words text-black">{displayValue}</span>
        </div>
    );
}

function HeaderNameTokenField({
    patientName,
    ageSex,
    token,
}: {
    patientName: string;
    ageSex: string;
    token?: string | number | null;
}) {
    const hasAgeSex = Boolean(ageSex);
    const hasToken = token !== null && token !== undefined && token !== "";

    return (
        <div className="flex min-w-0 items-baseline gap-1 text-left">
            <span className="shrink-0 whitespace-nowrap font-semibold text-black">Name:</span>
            <span className="shrink-0 whitespace-nowrap text-black">{patientName || "Unnamed"}</span>
            {hasAgeSex ? <span className="shrink-0 whitespace-nowrap text-black">({ageSex})</span> : null}
            {hasToken ? (
                <>
                    <span className="shrink-0 whitespace-nowrap pl-2 font-semibold text-black">Token:</span>
                    <span className="shrink-0 whitespace-nowrap text-black">{token}</span>
                </>
            ) : null}
        </div>
    );
}

function doctorNameWithPrefix(name: string | null | undefined) {
    const clean = String(name || "").trim();
    if (!clean) return "";
    return /^dr\.?\s/i.test(clean) ? clean : `Dr. ${clean}`;
}

function shouldPrintHeaderWithPass(event: HmsSharedPaperPrintViewProps["event"]) {
    return (
        event.print_type === "INVESTIGATION_REQUEST" ||
        event.print_type === "CONSULTATION" ||
        event.print_type === "PRESCRIPTION"
    ) && Number(event.start_offset_mm) === 0;
}

function normalizeFontSize(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

function cssLength(value: string | number | null | undefined, fallback: string) {
    if (typeof value === "number" && Number.isFinite(value)) return `${value}mm`;
    const text = String(value || "").trim();
    return text || fallback;
}

function cssCalc(...values: Array<string | number | null | undefined>) {
    const parts = values.map((value) => cssLength(value, "0mm")).filter((value) => value !== "0mm" && value !== "0px");
    return parts.length > 0 ? `calc(${parts.join(" + ")})` : "0mm";
}

function resolvePageMargins(input: {
    pageMargins?: HmsSharedPaperPrintViewProps["pageMargins"];
    printablePrescription?: EmrPrintablePrescription | null;
}) {
    return {
        ...DEFAULT_MARGIN_CONFIG,
        ...(input.pageMargins || {}),
        ...(input.printablePrescription?.layout_settings.page_margin_json || {}),
    };
}

export default function HmsSharedPaperPrintView({
    event,
    visit,
    prescription,
    printablePrescription,
    omitTests = false,
    pageMargins: configuredPageMargins,
    headerConfig,
    showDoctorToken = false,
    backHref,
    documentTitlePrefix = "Rx",
}: HmsSharedPaperPrintViewProps) {
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [, setReportedHeight] = useState<number | null>(null);
    const [savingHeight, setSavingHeight] = useState(false);
    const [heightError, setHeightError] = useState("");
    const [markedFailed, setMarkedFailed] = useState(false);
    const [printLanguage, setPrintLanguage] = useState<PrintLanguage>("en");
    const showLanguageSelector = Boolean(printablePrescription) && (event.print_type === "CONSULTATION" || event.print_type === "PRESCRIPTION");
    const printableForPass = useMemo(() => {
        if (!printablePrescription || !omitTests) return printablePrescription;
        return {
            ...printablePrescription,
            prescription: {
                ...printablePrescription.prescription,
                tests: [],
            },
        };
    }, [omitTests, printablePrescription]);
    const pageMargins = resolvePageMargins({ pageMargins: configuredPageMargins, printablePrescription });
    const sharedContentPadding = {
        paddingTop: cssCalc(pageMargins.top, pageMargins.header_space, pageMargins.offset_y),
        paddingRight: cssCalc(pageMargins.right, pageMargins.right_strip_space),
        paddingBottom: "0mm",
        paddingLeft: cssCalc(pageMargins.left, pageMargins.left_strip_space, pageMargins.offset_x),
    };
    const subsequentContentPadding = {
        paddingTop: "0mm",
        paddingRight: sharedContentPadding.paddingRight,
        paddingBottom: sharedContentPadding.paddingBottom,
        paddingLeft: sharedContentPadding.paddingLeft,
    };
    const shouldIncludeHeader = event.print_type === "HEADER" || shouldPrintHeaderWithPass(event);
    const headerPadding = shouldIncludeHeader ? sharedContentPadding : subsequentContentPadding;

    const patientName = visit.patient_name?.trim() || "Patient";
    useStableDocumentTitle(`${documentTitlePrefix}-${patientName}`);

    const measureHeight = useCallback(() => {
        const node = contentRef.current;
        if (!node) return null;

        const rect = node.getBoundingClientRect();
        const heightMm = Math.round(rect.height * PX_TO_MM * 100) / 100;
        return heightMm > 0 ? heightMm : null;
    }, []);

    const reportHeight = useCallback(async () => {
        const renderedHeightMm = measureHeight();
        if (!renderedHeightMm) return;

        setSavingHeight(true);
        setHeightError("");

        try {
            const response = await fetch(`/api/hms/print-events/${event.event_id}/height`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rendered_height_mm: renderedHeightMm }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setHeightError(data.error || "Unable to save rendered height.");
                return;
            }

            setReportedHeight(renderedHeightMm);
        } catch {
            setHeightError("Unable to save rendered height. Check your connection and try again.");
        } finally {
            setSavingHeight(false);
        }
    }, [event.event_id, measureHeight]);

    useEffect(() => {
        const timeout = window.setTimeout(() => void reportHeight(), 250);
        window.addEventListener("beforeprint", reportHeight);

        return () => {
            window.clearTimeout(timeout);
            window.removeEventListener("beforeprint", reportHeight);
        };
    }, [reportHeight]);

    const handlePrint = async () => {
        await reportHeight();
        window.print();
    };

    const markPrintFailed = async () => {
        setSavingHeight(true);
        setHeightError("");

        try {
            const response = await fetch(`/api/hms/print-events/${event.event_id}/height`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mark_failed: true }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setHeightError(data.error || "Unable to mark print as failed.");
                return;
            }

            setReportedHeight(0);
            setMarkedFailed(true);
        } catch {
            setHeightError("Unable to mark print as failed. Check your connection and try again.");
        } finally {
            setSavingHeight(false);
        }
    };

    return (
        <div className="min-h-screen bg-white px-4 py-6 text-black print:bg-white print:p-0">
            <style>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }

                    body {
                        background: #fff !important;
                    }

                    .no-print,
                    .dashboard-sidebar,
                    .dashboard-mobile-toggle,
                    .dashboard-mobile-overlay,
                    .hms-print-actions,
                    [data-hms-print-actions="true"] {
                        display: none !important;
                        visibility: hidden !important;
                        height: 0 !important;
                        overflow: hidden !important;
                    }

                    .dashboard-layout {
                        display: block !important;
                    }

                    .dashboard-main {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                    }

                    .hms-print-page {
                        border: 0 !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                        min-height: 297mm !important;
                        width: 210mm !important;
                    }
                }

                .hms-print-page [class*="text-gray"],
                .hms-print-page [class*="text-slate"],
                .hms-print-page [class*="text-indigo"] {
                    color: #000 !important;
                }

                .hms-print-page [class*="border-gray"],
                .hms-print-page [class*="border-slate"],
                .hms-print-page [class*="border-indigo"] {
                    border-color: #000 !important;
                }

                .hms-print-page [class*="bg-gray"],
                .hms-print-page [class*="bg-slate"],
                .hms-print-page [class*="bg-indigo"] {
                    background: #fff !important;
                    background-image: none !important;
                }

                .hms-print-page .emr-embedded-print,
                .hms-print-page .emr-embedded-print .emr-print-surface,
                .hms-print-page .emr-embedded-print .emr-print-content {
                    margin-top: 0 !important;
                    padding-top: 0 !important;
                }

                .hms-print-page .emr-embedded-print .emr-print-section:first-child {
                    margin-top: 0 !important;
                    padding-top: 0 !important;
                }
            `}</style>

            <div data-hms-print-actions="true" className="no-print hms-print-actions print:hidden mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-lg border border-black bg-white px-4 py-3">
                <div>
                    <p className="text-sm font-semibold text-black">Print Preview</p>
                    {heightError && <p className="mt-1 text-xs text-red-600">{heightError}</p>}
                    {markedFailed && <p className="mt-1 text-xs text-amber-700">Marked failed. Future print passes can continue from the current sheet position.</p>}
                </div>
                <div className="flex gap-2">
                    {showLanguageSelector && (
                        <label className="inline-flex items-center gap-2 text-sm font-semibold text-black">
                            Language
                            <select
                                value={printLanguage}
                                onChange={(changeEvent) => setPrintLanguage(changeEvent.target.value as PrintLanguage)}
                                className="rounded-lg border border-black bg-white px-3 py-2 text-sm text-black"
                            >
                                {LANGUAGE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    <Link href={backHref} className="inline-flex items-center gap-2 rounded-lg border border-black px-3 py-2 text-sm font-semibold text-black hover:bg-black hover:text-white">
                        <ArrowLeft size={15} />
                        Back
                    </Link>
                    <button
                        type="button"
                        onClick={handlePrint}
                        disabled={savingHeight}
                        className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
                    >
                        {savingHeight ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                        Print
                    </button>
                    <button
                        type="button"
                        onClick={markPrintFailed}
                        disabled={savingHeight}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
                    >
                        Mark Failed
                    </button>
                </div>
            </div>

            <article className="hms-print-page mx-auto min-h-[297mm] w-[210mm] border border-black bg-white shadow-sm">
                <div style={{ paddingTop: `${event.start_offset_mm}mm` }}>
                    <div
                        ref={contentRef}
                        className="text-black"
                    >
                        {event.print_type === "HEADER" ? (
                            <div style={headerPadding}>
                                <HeaderContent visit={visit} headerConfig={headerConfig} showDoctorToken={showDoctorToken} />
                            </div>
                        ) : event.print_type === "CONSULTATION" || event.print_type === "PRESCRIPTION" ? (
                            printableForPass ? (
                                <>
                                    {shouldPrintHeaderWithPass(event) && (
                                        <div style={headerPadding}>
                                            <HeaderContent visit={visit} headerConfig={headerConfig} showDoctorToken={showDoctorToken} />
                                        </div>
                                    )}
                                    <EmrPrintablePrescriptionView
                                        printable={printableForPass}
                                        backHref={backHref}
                                        embedded
                                        printLanguage={printLanguage}
                                    />
                                </>
                            ) : (
                                <PrintErrorContent message="Final prescription is not ready to print." />
                            )
                        ) : (
                            <>
                                {shouldPrintHeaderWithPass(event) && (
                                    <div style={headerPadding}>
                                        <HeaderContent visit={visit} headerConfig={headerConfig} showDoctorToken={showDoctorToken} />
                                    </div>
                                )}
                                <div style={shouldPrintHeaderWithPass(event) ? subsequentContentPadding : headerPadding}>
                                    <PassContent prescription={prescription} printType={event.print_type} />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </article>
        </div>
    );
}

function HeaderContent({
    visit,
    headerConfig,
    showDoctorToken = false,
}: {
    visit: HmsSharedPaperPrintViewProps["visit"];
    headerConfig?: HmsSharedPaperPrintViewProps["headerConfig"];
    showDoctorToken?: boolean;
}) {
    const config = headerConfig?.reception_header || {};
    const showUhid = config.show_uhid !== false;
    const showOpd = config.show_opd !== false;
    const showRoomNo = config.show_room_no !== false;
    const showName = config.show_name !== false;
    const showAgeSex = config.show_age_sex !== false;
    const showMobileNo = config.show_mobile_no !== false;
    const showFee = config.show_fee !== false;
    const showVisitedOn = config.show_visited_on !== false;
    const showPrintedOn = config.show_printed_on !== false;
    const titleFontSize = normalizeFontSize(config.title_font_size_px, 16, 12, 28);
    const bodyFontSize = normalizeFontSize(config.body_font_size_px, 12, 9, 18);
    const gender = visit.gender ? visit.gender.slice(0, 1).toUpperCase() : "-";
    const ageSex = `${visit.age ?? "-"}/${gender}`;
    const patientName = visit.patient_name || "Unnamed";
    const shouldUseWideNameRow = showDoctorToken && patientName.length > 14;
    const slipTitle = visit.visit_type === "OPD_NEW" || visit.visit_type === "LAB_ONLY" ? "NEW OPD SLIP" : "RENEWED OPD SLIP";
    const referredBy = visit.visit_type === "REFERRAL" ? doctorNameWithPrefix(visit.referred_by_doctor_name) : "";

    return (
        <div className="space-y-1.5 font-bold leading-tight text-black" style={{ fontSize: `${bodyFontSize}px` }}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 border-b border-black pb-1.5">
                <p className="min-w-0 truncate text-left text-[11px] font-semibold uppercase text-black">
                    {referredBy ? `Referred by: ${referredBy}` : ""}
                </p>
                <h1 className="text-center font-bold uppercase tracking-normal text-black" style={{ fontSize: `${titleFontSize}px` }}>{slipTitle}</h1>
                <p className="text-right text-[11px] font-semibold text-black">Fee Valid upto Three Days.</p>
            </div>

            <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(120px,0.85fr)] items-baseline gap-x-3 gap-y-1 uppercase">
                {showUhid ? <HeaderField label="UHID" value={visit.patient_uhid} /> : <div />}
                {showOpd ? <HeaderField label="OPD" value={visit.visit_number || `Visit ${visit.visit_id}`} /> : <div />}
                {showRoomNo ? <HeaderField label="Room No." value={visit.room_no} align="right" /> : <div />}
            </div>
            <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(120px,0.85fr)] items-baseline gap-x-3 gap-y-1 uppercase">
                {showName ? (
                    <div className={showDoctorToken ? (shouldUseWideNameRow ? "col-span-2 min-w-0" : "min-w-0") : "col-span-2 min-w-0"}>
                        <HeaderNameTokenField
                            patientName={patientName}
                            ageSex={showAgeSex ? ageSex : ""}
                            token={shouldUseWideNameRow ? visit.daily_token_number : null}
                        />
                    </div>
                ) : <div className={showDoctorToken ? "" : "col-span-2"} />}
                {showDoctorToken && !shouldUseWideNameRow ? <HeaderField label="Token" value={visit.daily_token_number} /> : null}
                {showMobileNo ? <HeaderField label="Mob. No." value={visit.patient_phone || "-"} align="right" /> : <div />}
            </div>
            <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(120px,0.85fr)] items-baseline gap-x-3 gap-y-1 uppercase">
                {showFee ? <HeaderField label="Fee" value={formatFee(visit.fee_charged)} /> : <div />}
                {showVisitedOn ? <HeaderField label="Visited On" value={toDateLabel(visit.visit_date)} /> : <div />}
                {showPrintedOn ? <HeaderField label="Printed On" value={getPrintedOnLabel()} align="right" /> : <div />}
            </div>
            <div className="border-b border-black pt-1" />
        </div>
    );
}

function PassContent({
    prescription,
    printType,
}: {
    prescription: HmsSharedPaperPrintViewProps["prescription"];
    printType: HmsPrintType;
}) {
    return (
        <div className="space-y-4 text-sm">
            {prescription ? (
                printType === "INVESTIGATION_REQUEST" ? (
                    <InvestigationRequestContent tests={prescription.tests || []} />
                ) : (
                    <PrintErrorContent message="This print pass is not available." />
                )
            ) : (
                <PrintErrorContent message="No prescription is linked to this print pass." />
            )}
        </div>
    );
}

function InvestigationRequestContent({
    tests,
}: {
    tests: NonNullable<HmsSharedPaperPrintViewProps["prescription"]>["tests"];
}) {
    const testLine = (tests || [])
        .map((test) => {
            const name = String(test.test_name || "").trim();
            const notes = String(test.notes || "").trim();
            return [name, notes ? `(${notes})` : ""].filter(Boolean).join(" ");
        })
        .filter(Boolean)
        .join(", ");

    return (
        <div className="border-b border-black pb-2 text-black">
            <p className="text-xs font-bold uppercase tracking-normal text-black">Investigation Request</p>
            {!testLine ? (
                <p className="mt-1 text-sm uppercase leading-snug text-black">No tests requested.</p>
            ) : (
                <p className="mt-1 text-sm font-semibold uppercase leading-snug text-black">{testLine}</p>
            )}
        </div>
    );
}

function PrintErrorContent({ message }: { message: string }) {
    return (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {message}
        </div>
    );
}
