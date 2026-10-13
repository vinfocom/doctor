"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Printer, RefreshCw, Search, UserRound, XCircle } from "lucide-react";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

type StaffViewMode = "registration" | "patients" | "visits";
type OldOpdSearchMode = "PATIENT" | "UHID" | "OPD";
type IdSearchTemplate = { prefix: string; suffix: string; padTo: number; roomNumberRequired: boolean } | null;

type Patient = {
    patient_id: number;
    uhid: string | null;
    full_name: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
    city: string | null;
    location: string | null;
    address: string | null;
    last_visit_date?: string | null;
    last_visit_number?: string | null;
    last_doctor_id?: number | null;
    last_doctor_room_no?: string | null;
};

type Visit = {
    visit_id: number;
    patient_id: number;
    doctor_id: number;
    visit_date: string;
    visit_type: string;
    visit_number: string | null;
    daily_token_number: number | null;
    status: string;
    fee_charged: number;
    payment_mode: string;
    payment_status: string;
    created_at?: string | null;
    patient: {
        patient_id: number;
        full_name: string | null;
        uhid: string | null;
        phone: string | null;
        age: number | null;
        gender: string | null;
        city: string | null;
        location: string | null;
        address: string | null;
    };
    doctor: {
        doctor_id: number;
        doctor_name: string | null;
        room_no: string | null;
    };
    counter?: {
        countedVisitsAfterCreate: number;
        dailyCapacity: number;
        surchargeApplied: boolean;
    };
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
    doctor_id: number | null;
    room_no: string | null;
    admin_id: number | null;
    patient_id: number | null;
    visit_id: number | null;
    resolved_at: string | null;
    created_at: string | null;
    doctor: {
        doctor_id: number;
        doctor_name: string | null;
        room_no: string | null;
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

type DoctorQueue = {
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
    daily_capacity: number | null;
    total_visits: number;
    active_visits: number;
    waiting_visits: number;
    in_consult_visits: number;
    lab_visits: number;
    completed_visits: number;
    cancelled_visits: number;
    paid_visits: number;
    pending_visits: number;
    visits: Visit[];
};

type VisitsResponse = {
    visits: Visit[];
    doctorQueues: DoctorQueue[];
    searchIdFormats?: { uhid: IdSearchTemplate; opd: IdSearchTemplate };
    feePolicy?: {
        registrationFee: number;
        consultationFee: number;
        feeWaiverAllowed?: boolean;
        feeWaiverReasonRequired?: boolean;
        waiverReasonOptions?: string[];
        surchargeEnabled: boolean;
        surchargeAmount: number;
    };
    totals: {
        visits: number;
        active: number;
        waiting: number;
        paid: number;
        pending: number;
        cancelled: number;
    };
    pagination?: PaginationState;
};

type PaginationState = {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
};

type PatientForm = {
    full_name: string;
    age: string;
    gender: string;
    phone: string;
    city: string;
    location: string;
    address: string;
};

type VisitForm = {
    patient_id: string;
    doctor_id: string;
    referred_by_doctor_id: string;
    referring_prescription_id: string;
    visit_date: string;
    visit_type: string;
    payment_mode: string;
    payment_status: string;
    fee_charged: string;
    fee_waived_reason: string;
    fee_waiver_reason_source: "" | "PRESET" | "CUSTOM";
    override_reason: string;
};

type FollowupEligibility = {
    eligible: boolean;
    reason: string;
    previous_visit_date?: string;
    valid_until?: string;
};

const PATIENT_PAGE_SIZE = 25;
const VISIT_PAGE_SIZE = 25;

const emptyPatientForm: PatientForm = {
    full_name: "",
    age: "",
    gender: "",
    phone: "",
    city: "",
    location: "",
    address: "",
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

function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(value);
}

function formatFeeInput(value: number | null) {
    if (value === null || !Number.isFinite(value)) return "";
    return value % 1 === 0 ? String(value) : value.toFixed(2);
}

function sanitizeFeeInput(value: string) {
    const cleaned = value.replace(/[^\d.]/g, "");
    const [whole, ...decimalParts] = cleaned.split(".");
    const decimal = decimalParts.join("").slice(0, 2);
    return decimalParts.length > 0 ? `${whole}.${decimal}` : whole;
}

function statusClass(status: string) {
    if (status === "WAITING") return "border border-black bg-white text-black";
    if (status === "IN_CONSULT") return "bg-black text-white";
    if (status === "LAB") return "bg-amber-100 text-amber-800";
    if (status === "COMPLETED") return "bg-emerald-100 text-emerald-800";
    return "bg-red-100 text-red-700";
}

function statusLabel(value: string) {
    return String(value || "").replace(/_/g, " ");
}

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function patientMatchesOpdSearch(patient: Patient, search: string) {
    const query = normalizeText(search).toLowerCase();
    if (!query) return true;

    const digitQuery = query.replace(/\D/g, "");
    const values = [
        patient.uhid,
        patient.full_name,
        patient.phone,
    ].map((value) => String(value || "").toLowerCase());

    if (values.some((value) => value.includes(query))) return true;
    return Boolean(digitQuery && String(patient.phone || "").replace(/\D/g, "").includes(digitQuery));
}

function patientLabel(patient: { full_name: string | null; age?: number | null; gender?: string | null }) {
    const ageSex = [patient.age ?? null, patient.gender ? patient.gender.slice(0, 1).toUpperCase() : null].filter(Boolean).join("/");
    return `${patient.full_name || "Unnamed"}${ageSex ? ` (${ageSex})` : ""}`;
}

function normalizeFormGender(value: string | null | undefined) {
    const gender = String(value || "").trim().toUpperCase();
    if (gender === "M" || gender === "MALE") return "MALE";
    if (gender === "F" || gender === "FEMALE") return "FEMALE";
    if (gender === "O" || gender === "OTHER") return "OTHER";
    return "";
}

function doctorNameWithPrefix(name: string | null) {
    const clean = String(name || "").trim();
    if (!clean) return "Dr.";
    return /^dr\.?\s/i.test(clean) ? clean : `Dr. ${clean}`;
}

function countedDoctorVisits(queue: Pick<DoctorQueue, "total_visits" | "cancelled_visits">) {
    return Math.max(0, Number(queue.total_visits || 0) - Number(queue.cancelled_visits || 0));
}

function doctorOptionLabel(doctor: DoctorQueue) {
    const room = String(doctor.room_no || "-").trim() || "-";
    const capacity = doctor.daily_capacity ? String(doctor.daily_capacity) : "-";
    return `${room} - ${doctorNameWithPrefix(doctor.doctor_name)} - ${countedDoctorVisits(doctor)}/${capacity}`;
}

function doctorOptionSearchLabel(doctor: DoctorQueue) {
    return String(doctor.doctor_name || "").replace(/^dr\.?\s*/i, "").trim();
}

const REGISTRATION_KEYBOARD_STEPS = ["opd-type", "doctor", "patient-name", "patient-age", "patient-sex", "save"];
const REGISTRATION_SEX_KEYS: Record<string, string> = { m: "MALE", f: "FEMALE", o: "OTHER" };

function opdSlipWindowName(visit: Partial<Pick<Visit, "patient">> | null | undefined) {
    const name = String(visit?.patient?.full_name || "Patient").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Patient";
    return `OPD-Slip-${name}`;
}

function latestVisitsFirst(visits: Visit[]) {
    return [...visits].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        return Number(b.visit_id || 0) - Number(a.visit_id || 0);
    });
}

function focusNextOnEnter(event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();

    const form = event.currentTarget.form;
    if (!form) return;

    const controls = Array.from(
        form.querySelectorAll<HTMLElement>("input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])")
    ).filter((control) => control.tabIndex !== -1 && control.getAttribute("aria-hidden") !== "true");
    const index = controls.indexOf(event.currentTarget);
    controls[index + 1]?.focus();
}

export default function HmsReceptionDashboardClient({
    mode = "registration",
    preRegistrationEnabled = false,
}: {
    mode?: StaffViewMode;
    preRegistrationEnabled?: boolean;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tempTokenRegistrationIdParam = searchParams?.get("tempTokenRegistrationId");
    const [patients, setPatients] = useState<Patient[]>([]);
    const [visitsData, setVisitsData] = useState<VisitsResponse | null>(null);
    const [tempTokens, setTempTokens] = useState<TempToken[]>([]);
    const [tempTokenSearch, setTempTokenSearch] = useState("");
    const [selectedTempToken, setSelectedTempToken] = useState<TempToken | null>(null);
    const [tempTokenPanelCollapsed, setTempTokenPanelCollapsed] = useState(true);
    const [patientSearch, setPatientSearch] = useState("");
    const [oldOpdSearch, setOldOpdSearch] = useState("");
    const [oldOpdSearchMode, setOldOpdSearchMode] = useState<OldOpdSearchMode>("OPD");
    const [oldOpdSearchSubmitted, setOldOpdSearchSubmitted] = useState(false);
    const oldOpdSearchRequestRef = useRef(0);
    const [loadingTempTokens, setLoadingTempTokens] = useState(false);
    const [patientForm, setPatientForm] = useState(emptyPatientForm);
    const [visitForm, setVisitForm] = useState<VisitForm>({
        patient_id: "",
        doctor_id: "",
        referred_by_doctor_id: "",
        referring_prescription_id: "",
        visit_date: todayYmd(),
        visit_type: "OPD_NEW",
        payment_mode: "CASH",
        payment_status: "PAID",
        fee_charged: "",
        fee_waived_reason: "",
        fee_waiver_reason_source: "",
        override_reason: "",
    });
    const [feeManuallyEdited, setFeeManuallyEdited] = useState(false);
    const [waiverReasonOpen, setWaiverReasonOpen] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [exactUhid, setExactUhid] = useState("");
    const [showOverride, setShowOverride] = useState(false);
    const [duplicateWarningDismissed, setDuplicateWarningDismissed] = useState(false);
    const [patientErrors, setPatientErrors] = useState<Partial<Record<keyof PatientForm, string>>>({});
    const [visitErrors, setVisitErrors] = useState<Partial<Record<keyof VisitForm, string>>>({});
    const [loadingPatients, setLoadingPatients] = useState(false);
    const [loadingVisits, setLoadingVisits] = useState(false);
    const [checkingFollowup, setCheckingFollowup] = useState(false);
    const [followupEligibility, setFollowupEligibility] = useState<FollowupEligibility | null>(null);
    const [submittingRegistration, setSubmittingRegistration] = useState(false);
    const submittingRegistrationRef = useRef(false);
    submittingRegistrationRef.current = submittingRegistration;
    const [actingVisitId, setActingVisitId] = useState<number | null>(null);
    const [cancelVisit, setCancelVisit] = useState<Visit | null>(null);
    const [createdVisit, setCreatedVisit] = useState<Visit | null>(null);
    const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
    const registrationFormRef = useRef<HTMLFormElement | null>(null);
    const printSlipRef = useRef<HTMLAnchorElement | null>(null);
    const focusPrintSlipAfterSave = useRef(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const clearError = useCallback(() => setError(""), []);
    const clearSuccess = useCallback(() => setSuccess(""), []);

    useEffect(() => {
        if (!createdVisit || !focusPrintSlipAfterSave.current) return;
        focusPrintSlipAfterSave.current = false;
        const frame = window.requestAnimationFrame(() => printSlipRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [createdVisit]);
    const [patientDate, setPatientDate] = useState(todayYmd());
    const [patientPage, setPatientPage] = useState(1);
    const [patientPagination, setPatientPagination] = useState<PaginationState>({
        page: 1,
        page_size: PATIENT_PAGE_SIZE,
        total: 0,
        total_pages: 1,
    });
    const [visitPage, setVisitPage] = useState(1);
    const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
    const [editPatientForm, setEditPatientForm] = useState<PatientForm>(emptyPatientForm);
    const [editPatientErrors, setEditPatientErrors] = useState<Partial<Record<keyof PatientForm, string>>>({});
    const [savingPatientEdit, setSavingPatientEdit] = useState(false);
    const showTempTokenPanel = mode === "registration" && preRegistrationEnabled;

    const doctors = useMemo(() => visitsData?.doctorQueues || [], [visitsData]);
    const requiresExistingPatient = ["OPD_OLD", "REFERRAL"].includes(visitForm.visit_type);
    const canCreateNewPatient = !requiresExistingPatient || showOverride;
    const likelyDuplicateWarning = visitForm.visit_type === "OPD_NEW" && !selectedPatient && !duplicateWarningDismissed && patients.length > 0;
    const patientCounts = useMemo(() => ({
        total: patientPagination.total,
        withPhone: patients.filter((patient) => patient.phone).length,
        listed: patients.length,
    }), [patientPagination.total, patients]);
    const title = mode === "patients" ? "Patients" : mode === "visits" ? "Today's OPD Visits" : "New OPD Registration";
    const feeWaiverReasonRequired = visitsData?.feePolicy?.feeWaiverReasonRequired !== false;
    const registrationPatientResults = useMemo(
        () => mode === "registration" && patientSearch.trim()
            ? patients.filter((patient) => patientMatchesOpdSearch(patient, patientSearch))
            : patients,
        [mode, patientSearch, patients]
    );
    const visitPagination = visitsData?.pagination || {
        page: visitPage,
        page_size: VISIT_PAGE_SIZE,
        total: visitsData?.visits.length || 0,
        total_pages: Math.max(1, Math.ceil((visitsData?.visits.length || 0) / VISIT_PAGE_SIZE)),
    };
    const visitTotalPages = Math.max(1, visitPagination.total_pages);

    useHmsAutoDismissMessage(error, clearError, 7500);
    useHmsAutoDismissMessage(success, clearSuccess, 5000);

    const loadPatients = useCallback(async () => {
        if (mode === "registration" && visitForm.visit_type === "OPD_OLD") {
            return;
        }

        const tempTokenSearchHint = showTempTokenPanel && requiresExistingPatient && selectedTempToken?.patient_name
            ? selectedTempToken.patient_name.trim()
            : "";
        const effectivePatientSearch = patientSearch.trim() || tempTokenSearchHint;

        if (mode === "registration" && !effectivePatientSearch) {
            setPatients([]);
            return;
        }

        setLoadingPatients(true);
        setError("");

        try {
            const params = new URLSearchParams();
            if (effectivePatientSearch) params.set("q", effectivePatientSearch);
            if (showTempTokenPanel && requiresExistingPatient && selectedTempToken?.gender) {
                const tokenGender = normalizeFormGender(selectedTempToken.gender);
                if (tokenGender) params.set("gender", tokenGender);
            }
            if (mode === "patients") {
                params.set("visit_date", patientDate);
                params.set("page", String(patientPage));
                params.set("page_size", String(PATIENT_PAGE_SIZE));
            }
            const response = await fetch(`/api/hms/staff/patients${params.toString() ? `?${params.toString()}` : ""}`, { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to search patients.");
                return;
            }
            setPatients(Array.isArray(data.patients) ? data.patients : []);
            if (data.pagination) {
                setPatientPagination(data.pagination);
            } else if (mode === "registration") {
                setPatientPagination({
                    page: 1,
                    page_size: PATIENT_PAGE_SIZE,
                    total: Array.isArray(data.patients) ? data.patients.length : 0,
                    total_pages: 1,
                });
            }
        } catch {
            setError("Unable to search patients. Check your connection and try again.");
        } finally {
            setLoadingPatients(false);
        }
    }, [mode, patientDate, patientPage, patientSearch, requiresExistingPatient, selectedTempToken, showTempTokenPanel, visitForm.visit_type]);

    const loadVisits = useCallback(async () => {
        setLoadingVisits(true);

        try {
            const params = new URLSearchParams({ date: visitForm.visit_date });
            params.set("page", mode === "visits" ? String(visitPage) : "1");
            params.set("page_size", String(VISIT_PAGE_SIZE));
            params.set("order", "recent");
            const response = await fetch(`/api/hms/staff/visits?${params.toString()}`, { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to load visits.");
                return;
            }
            setVisitsData(data);
        } catch {
            setError("Unable to load visits. Check your connection and try again.");
        } finally {
            setLoadingVisits(false);
        }
    }, [mode, visitForm.visit_date, visitPage]);

    const loadTempTokens = useCallback(async (options?: { silent?: boolean }) => {
        if (!showTempTokenPanel) {
            setTempTokens([]);
            return;
        }

        const silent = options?.silent ?? false;
        if (!silent) setLoadingTempTokens(true);
        try {
            const params = new URLSearchParams();
            params.set("limit", "12");
            if (tempTokenSearch.trim()) params.set("q", tempTokenSearch.trim());
            const response = await fetch(`/api/hms/staff/temp-tokens${params.toString() ? `?${params.toString()}` : ""}`, {
                cache: "no-store",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to load pre-registration tokens.");
                return;
            }
            setTempTokens(Array.isArray(data.tempTokens) ? data.tempTokens : []);
        } catch {
            setError("Unable to load pre-registration tokens. Check your connection and try again.");
        } finally {
            if (!silent) setLoadingTempTokens(false);
        }
    }, [showTempTokenPanel, tempTokenSearch]);

    useEffect(() => {
        void loadPatients();
    }, [loadPatients]);

    useEffect(() => {
        void loadVisits();
        const interval = window.setInterval(() => void loadVisits(), 15000);
        return () => window.clearInterval(interval);
    }, [loadVisits]);

    useEffect(() => {
        if (!showTempTokenPanel) return;
        const timer = window.setTimeout(() => {
            void loadTempTokens({ silent: true });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [loadTempTokens, showTempTokenPanel, tempTokenSearch]);

    useEffect(() => {
        setPatientPage(1);
    }, [patientDate]);

    useEffect(() => {
        setVisitPage(1);
    }, [visitForm.visit_date]);

    useEffect(() => {
        if (visitPage > visitTotalPages) setVisitPage(visitTotalPages);
    }, [visitPage, visitTotalPages]);

    useEffect(() => {
        if (!showTempTokenPanel) return;
        setSelectedTempToken(null);
    }, [showTempTokenPanel]);

    useEffect(() => {
        if (!showTempTokenPanel || !selectedTempToken) return;

        const tokenName = normalizeText(selectedTempToken.patient_name);
        if (requiresExistingPatient) {
            if (visitForm.visit_type === "OPD_OLD" && tokenName && !oldOpdSearch.trim()) {
                setOldOpdSearchMode("PATIENT");
                setOldOpdSearch(tokenName);
            }
            if (tokenName && !patientSearch.trim()) {
                setPatientSearch(tokenName);
            }
            return;
        }

        if (tokenName && patientSearch.trim() === tokenName) {
            setPatientSearch("");
        }
    }, [oldOpdSearch, patientSearch, requiresExistingPatient, selectedTempToken, showTempTokenPanel, visitForm.visit_type]);

    useEffect(() => {
        if (!showTempTokenPanel || !tempTokenRegistrationIdParam) return;

        const registrationId = Number(tempTokenRegistrationIdParam);
        if (!Number.isInteger(registrationId) || registrationId <= 0) return;

        let active = true;

        void (async () => {
            try {
                const params = new URLSearchParams({
                    registration_id: String(registrationId),
                    limit: "1",
                    scope: "ALL",
                });
                const response = await fetch(`/api/hms/staff/temp-tokens?${params.toString()}`, { cache: "no-store" });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    setError(data.error || "Unable to load pre-registration token.");
                    return;
                }

                const token = Array.isArray(data.tempTokens) ? (data.tempTokens[0] as TempToken | undefined) : undefined;
                if (!active || !token) {
                    if (active) setError("Pre-registration token not found.");
                    return;
                }

                setTempTokens(Array.isArray(data.tempTokens) ? data.tempTokens : []);
                setTempTokenPanelCollapsed(false);
                setSelectedTempToken(token);
                setSelectedPatient(null);
                setVisitForm((prev) => ({
                    ...prev,
                    patient_id: "",
                    doctor_id: token.doctor_id ? String(token.doctor_id) : prev.doctor_id,
                    referred_by_doctor_id: "",
                    referring_prescription_id: "",
                    override_reason: "",
                }));
                setPatientForm({
                    full_name: token.patient_name || "",
                    age: token.age === null || token.age === undefined ? "" : String(token.age),
                    gender: token.gender || "",
                    phone: token.phone || "",
                    city: "",
                    location: "",
                    address: "",
                });
                setShowOverride(false);
                setDuplicateWarningDismissed(false);
                setPatientErrors({});
                setVisitErrors((prev) => ({ ...prev, patient_id: undefined, override_reason: undefined, doctor_id: undefined }));
                setSuccess("");
                router.replace("/hms/staff/new-registration", { scroll: false });
            } catch {
                if (active) setError("Unable to load pre-registration token. Check your connection and try again.");
            } finally {
                if (active) setLoadingTempTokens(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [router, showTempTokenPanel, tempTokenRegistrationIdParam]);

    useEffect(() => {
        if (!showTempTokenPanel) return;
        const timer = window.setInterval(() => {
            void loadTempTokens({ silent: true });
        }, 15000);

        return () => window.clearInterval(timer);
    }, [loadTempTokens, showTempTokenPanel]);

    useEffect(() => {
        if (!visitForm.doctor_id || loadingVisits) return;
        const stillBookable = doctors.some((doctor) => String(doctor.doctor_id) === visitForm.doctor_id);
        if (!stillBookable) {
            setVisitForm((prev) => ({ ...prev, doctor_id: "", referred_by_doctor_id: "", referring_prescription_id: "" }));
            setVisitErrors((prev) => ({ ...prev, doctor_id: "Doctor is not available on the selected date." }));
        }
    }, [doctors, loadingVisits, visitForm.doctor_id]);

    useEffect(() => {
        const canCheckEligibility = visitForm.visit_type === "OPD_OLD"
            ? !!selectedPatient && !!visitForm.doctor_id && !!visitForm.visit_date
            : visitForm.visit_type === "REFERRAL"
                ? !!selectedPatient && !!visitForm.doctor_id && !!visitForm.referred_by_doctor_id && !!visitForm.visit_date
                : false;
        if (!canCheckEligibility) {
            setFollowupEligibility(null);
            return;
        }
        const patientForEligibility = selectedPatient;
        if (!patientForEligibility) return;

        const controller = new AbortController();
        setCheckingFollowup(true);

        void fetch("/api/hms/staff/visits/followup-eligibility", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                patient_id: patientForEligibility.patient_id,
                doctor_id: Number(visitForm.doctor_id),
                visit_type: visitForm.visit_type,
                referred_by_doctor_id: visitForm.visit_type === "REFERRAL" ? Number(visitForm.referred_by_doctor_id) : null,
                visit_date: visitForm.visit_date,
            }),
            signal: controller.signal,
        })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || "Unable to check follow-up.");
                return data as FollowupEligibility;
            })
            .then((data) => {
                setFollowupEligibility(data);
                setFeeManuallyEdited(false);
                if (data.eligible) {
                    setVisitForm((prev) => ({
                        ...prev,
                        payment_mode: "FREE",
                        payment_status: "PAID",
                        fee_waived_reason: prev.fee_waived_reason || (visitForm.visit_type === "REFERRAL" ? "Referred doctor follow-up" : "Same doctor follow-up"),
                        fee_waiver_reason_source: "",
                    }));
                } else {
                    setVisitForm((prev) => prev.payment_mode === "FREE"
                        ? { ...prev, payment_mode: "CASH", payment_status: "PAID", fee_waived_reason: "", fee_waiver_reason_source: "" }
                        : prev);
                }
            })
            .catch((error) => {
                if (error instanceof DOMException && error.name === "AbortError") return;
                setFollowupEligibility({ eligible: false, reason: "Unable to check follow-up automatically." });
            })
            .finally(() => setCheckingFollowup(false));

        return () => controller.abort();
    }, [selectedPatient, visitForm.doctor_id, visitForm.referred_by_doctor_id, visitForm.visit_date, visitForm.visit_type]);

    const selectedDoctor = useMemo(() => doctors.find((doctor) => String(doctor.doctor_id) === visitForm.doctor_id) || null, [doctors, visitForm.doctor_id]);
    const estimatedFee = useMemo(() => {
        if (!visitsData?.feePolicy) return null;
        if (visitForm.payment_mode === "FREE") return 0;
        const baseFee = ["OPD_NEW", "CASUALTY", "LAB_ONLY"].includes(visitForm.visit_type)
            ? visitsData.feePolicy.registrationFee
            : visitsData.feePolicy.consultationFee;
        const threshold = selectedDoctor?.daily_capacity || null;
        const currentVisitIsInSelectedQueue = editingVisit && selectedDoctor?.doctor_id === editingVisit.doctor_id ? 1 : 0;
        const projectedCount = selectedDoctor ? countedDoctorVisits(selectedDoctor) - currentVisitIsInSelectedQueue + 1 : 0;
        const surcharge = selectedDoctor && threshold && visitsData.feePolicy.surchargeEnabled && projectedCount > threshold
            ? visitsData.feePolicy.surchargeAmount
            : 0;
        return baseFee + surcharge;
    }, [editingVisit, selectedDoctor, visitForm.payment_mode, visitForm.visit_type, visitsData?.feePolicy]);
    const paymentStatusOptions = useMemo(() => [
        { value: "PENDING", label: "Pending" },
        { value: "PAID", label: "Paid" },
    ], []);

    useEffect(() => {
        if (feeManuallyEdited) return;
        const nextFee = formatFeeInput(estimatedFee);
        setVisitForm((prev) => prev.fee_charged === nextFee ? prev : { ...prev, fee_charged: nextFee });
    }, [estimatedFee, feeManuallyEdited]);

    const updatePatientForm = (field: keyof PatientForm, value: string) => {
        const nextValue = field === "phone"
            ? value.replace(/\D/g, "").slice(0, 10)
            : field === "age"
                ? value.replace(/\D/g, "")
                : field === "full_name"
                    ? value.replace(/[^\p{L}\s]/gu, "")
                    : value;
        setPatientForm((prev) => ({ ...prev, [field]: nextValue }));
        setPatientErrors((prev) => ({ ...prev, [field]: undefined }));
        setSuccess("");
        setDuplicateWarningDismissed(false);
    };

    const updateVisitForm = (field: keyof VisitForm, value: string) => {
        const nextValue = field === "fee_charged" ? sanitizeFeeInput(value) : value;
        if (field === "fee_charged") setFeeManuallyEdited(true);
        if (field === "doctor_id" || field === "visit_date" || field === "visit_type" || field === "payment_mode") {
            setFeeManuallyEdited(false);
        }
        setVisitForm((prev) => ({ ...prev, [field]: nextValue }));
        setVisitErrors((prev) => ({ ...prev, [field]: undefined }));
        setSuccess("");
    };

    const updateWaiverReason = (value: string, source: "" | "PRESET" | "CUSTOM") => {
        setVisitForm((prev) => ({ ...prev, fee_waived_reason: value, fee_waiver_reason_source: source }));
        setVisitErrors((prev) => ({ ...prev, fee_waived_reason: undefined }));
        setSuccess("");
    };

    const resetRegistrationForm = () => {
        focusPrintSlipAfterSave.current = false;
        oldOpdSearchRequestRef.current += 1;
        setLoadingPatients(false);
        setPatientSearch("");
        setOldOpdSearch("");
        setOldOpdSearchMode("OPD");
        setOldOpdSearchSubmitted(false);
        setPatients([]);
        setTempTokenSearch("");
        setTempTokens([]);
        setSelectedTempToken(null);
        setPatientForm(emptyPatientForm);
        setVisitForm({
            patient_id: "",
            doctor_id: "",
            referred_by_doctor_id: "",
            referring_prescription_id: "",
            visit_date: todayYmd(),
            visit_type: "OPD_NEW",
            payment_mode: "CASH",
            payment_status: "PAID",
            // Reset starts a fresh OPD_NEW registration, so show its policy fee immediately.
            // The derived-fee effect will still recalculate once policy/doctor data is available.
            fee_charged: formatFeeInput(visitsData?.feePolicy?.registrationFee ?? null),
            fee_waived_reason: "",
            fee_waiver_reason_source: "",
            override_reason: "",
        });
        setFeeManuallyEdited(false);
        setSelectedPatient(null);
        setExactUhid("");
        setShowOverride(false);
        setDuplicateWarningDismissed(false);
        setPatientErrors({});
        setVisitErrors({});
        setFollowupEligibility(null);
        setCreatedVisit(null);
        setEditingVisit(null);
        setError("");
        setSuccess("");
        window.requestAnimationFrame(() => registrationFormRef.current?.querySelector<HTMLElement>("[data-registration-keyboard-step='opd-type']")?.focus());
    };

    const resetRegistrationFormRef = useRef(resetRegistrationForm);
    resetRegistrationFormRef.current = resetRegistrationForm;

    useEffect(() => {
        if (mode !== "registration") return;

        const handlePageShortcut = (event: KeyboardEvent) => {
            if (
                !event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.key.toLowerCase() !== "r" ||
                event.repeat ||
                event.isComposing
            ) return;

            event.preventDefault();
            if (!submittingRegistrationRef.current) resetRegistrationFormRef.current();
        };

        window.addEventListener("keydown", handlePageShortcut, true);
        return () => window.removeEventListener("keydown", handlePageShortcut, true);
    }, [mode]);

    const openEditVisit = (visit: Visit) => {
        if (visit.status !== "WAITING") return;
        setEditingVisit(visit);
        setSelectedTempToken(null);
        setSelectedPatient(visit.patient);
        setPatientForm({
            full_name: visit.patient.full_name || "",
            age: visit.patient.age === null || visit.patient.age === undefined ? "" : String(visit.patient.age),
            gender: visit.patient.gender || "",
            phone: visit.patient.phone || "",
            city: visit.patient.city || "",
            location: visit.patient.location || "",
            address: visit.patient.address || "",
        });
        setVisitForm((prev) => ({
            ...prev,
            patient_id: String(visit.patient_id),
            doctor_id: String(visit.doctor_id),
            visit_date: visit.visit_date,
            visit_type: visit.visit_type,
            payment_mode: visit.payment_mode,
            payment_status: visit.payment_status,
            fee_charged: formatFeeInput(visit.fee_charged),
            fee_waived_reason: "",
            fee_waiver_reason_source: "",
            override_reason: "",
        }));
        setFeeManuallyEdited(false);
        setPatientErrors({});
        setVisitErrors({});
        setError("");
        setSuccess("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const cancelEditVisit = () => {
        setEditingVisit(null);
        setSelectedPatient(null);
        setPatientForm(emptyPatientForm);
        setVisitForm((prev) => ({ ...prev, patient_id: "", doctor_id: "", fee_charged: "" }));
        setFeeManuallyEdited(false);
    };

    const selectPatient = (patient: Patient) => {
        if (selectedPatient && selectedPatient.patient_id !== patient.patient_id) {
            const confirmed = window.confirm("Replace the currently selected patient with this patient?");
            if (!confirmed) return;
        }

        setSelectedPatient(patient);
        if (visitForm.visit_type === "OPD_OLD") {
            setOldOpdSearchSubmitted(false);
        }
        const previousDoctor = visitForm.visit_type === "OPD_OLD"
            ? doctors.find((doctor) => doctor.doctor_id === patient.last_doctor_id)
            : null;
        setVisitForm((prev) => ({
            ...prev,
            patient_id: String(patient.patient_id),
            doctor_id: visitForm.visit_type === "OPD_OLD" ? (previousDoctor ? String(previousDoctor.doctor_id) : "") : prev.doctor_id,
            override_reason: "",
        }));
        setPatientForm({
            full_name: patient.full_name || "",
            age: patient.age === null || patient.age === undefined ? "" : String(patient.age),
            gender: patient.gender || "",
            phone: patient.phone || "",
            city: patient.city || "",
            location: patient.location || "",
            address: patient.address || "",
        });
        setShowOverride(false);
        setDuplicateWarningDismissed(true);
        setPatientErrors({});
        setVisitErrors((prev) => ({ ...prev, patient_id: undefined, override_reason: undefined }));
        if (visitForm.visit_type === "OPD_OLD") {
            window.requestAnimationFrame(() => registrationFormRef.current?.querySelector<HTMLElement>("[data-registration-keyboard-step='patient-name']")?.focus());
        }
    };

    const selectTempToken = (tempToken: TempToken) => {
        if (selectedTempToken && selectedTempToken.registration_id !== tempToken.registration_id) {
            const confirmed = window.confirm("Replace the current token details with this pending registration?");
            if (!confirmed) return;
        }

        const tokenDoctorId = tempToken.doctor_id ?? tempToken.doctor?.doctor_id ?? null;

        setSelectedTempToken(tempToken);
        setSelectedPatient(null);
        setVisitForm((prev) => ({
            ...prev,
            patient_id: "",
            doctor_id: tokenDoctorId ? String(tokenDoctorId) : prev.doctor_id,
            referred_by_doctor_id: "",
            referring_prescription_id: "",
            override_reason: "",
        }));
        setPatientForm({
            full_name: tempToken.patient_name || "",
            age: tempToken.age === null || tempToken.age === undefined ? "" : String(tempToken.age),
            gender: normalizeFormGender(tempToken.gender),
            phone: tempToken.phone || "",
            city: "",
            location: "",
            address: "",
        });
        setShowOverride(false);
        setDuplicateWarningDismissed(false);
        setPatientErrors({});
        setVisitErrors((prev) => ({ ...prev, patient_id: undefined, override_reason: undefined, doctor_id: undefined }));
        setSuccess("");
    };

    useEffect(() => {
        if (!selectedTempToken) return;

        const tokenDoctorId = selectedTempToken.doctor_id ?? selectedTempToken.doctor?.doctor_id ?? null;
        setPatientForm((prev) => ({
            ...prev,
            full_name: selectedTempToken.patient_name || prev.full_name,
            age: selectedTempToken.age === null || selectedTempToken.age === undefined ? prev.age : String(selectedTempToken.age),
            gender: normalizeFormGender(selectedTempToken.gender) || prev.gender,
            phone: selectedTempToken.phone || prev.phone,
        }));
        if (tokenDoctorId) {
            setVisitForm((prev) => (prev.doctor_id === String(tokenDoctorId) ? prev : { ...prev, doctor_id: String(tokenDoctorId) }));
        }
    }, [selectedTempToken]);

    const clearSelectedTempToken = () => {
        setSelectedTempToken(null);
    };

    const clearSelectedPatient = () => {
        setSelectedPatient(null);
        setVisitForm((prev) => ({ ...prev, patient_id: "" }));
        setPatientForm(emptyPatientForm);
    };

    const lookupExactUhid = async () => {
        const value = exactUhid.trim();
        if (!value) {
            setVisitErrors((prev) => ({ ...prev, patient_id: "Enter the UHID to search." }));
            return;
        }

        setLoadingPatients(true);
        setError("");
        try {
            const params = new URLSearchParams({ exact_uhid: value });
            const response = await fetch(`/api/hms/staff/patients?${params.toString()}`, { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to search UHID.");
                return;
            }
            const results = Array.isArray(data.patients) ? data.patients as Patient[] : [];
            setPatients(results);
            if (results.length === 1) {
                selectPatient(results[0]);
            } else if (results.length === 0) {
                setShowOverride(true);
                setVisitErrors((prev) => ({ ...prev, patient_id: "No patient found with this UHID in this hospital." }));
            }
        } catch {
            setError("Unable to search UHID. Check your connection and try again.");
        } finally {
            setLoadingPatients(false);
        }
    };

    const searchOldOpdPatient = async (mode: OldOpdSearchMode, value: string) => {
        const requestId = ++oldOpdSearchRequestRef.current;
        const searchText = value.trim() || (mode === "PATIENT" && showTempTokenPanel ? selectedTempToken?.patient_name?.trim() || "" : "");
        if (!searchText) {
            setPatients([]);
            setOldOpdSearchSubmitted(false);
            setLoadingPatients(false);
            return;
        }

        const params = new URLSearchParams();
        if (mode === "PATIENT") {
            params.set("lookup_type", "PATIENT");
            params.set("q", searchText);
            if (showTempTokenPanel && selectedTempToken?.gender) {
                const tokenGender = normalizeFormGender(selectedTempToken.gender);
                if (tokenGender) params.set("gender", tokenGender);
            }
        } else {
            const template = mode === "UHID" ? visitsData?.searchIdFormats?.uhid : visitsData?.searchIdFormats?.opd;
            const doctorRoom = doctors.find((queue) => String(queue.doctor_id) === visitForm.doctor_id)?.room_no || "";
            const prefix = (template?.prefix || "").replace("{{ROOM}}", doctorRoom);
            const isFullIdentifier = /[^0-9]/.test(searchText) || (prefix && searchText.toUpperCase().startsWith(prefix.toUpperCase()));
            if (template?.roomNumberRequired && !doctorRoom && !isFullIdentifier) {
                setError("Select the doctor room first, or enter the full OPD number.");
                setLoadingPatients(false);
                return;
            }
            const identifier = isFullIdentifier
                ? searchText
                : `${prefix}${searchText.padStart(template?.padTo || 1, "0")}${template?.suffix || ""}`;
            params.set("lookup_type", mode);
            params.set("identifier", identifier);
        }

        setLoadingPatients(true);
        setError("");
        setOldOpdSearchSubmitted(true);
        try {
            const response = await fetch(`/api/hms/staff/patients?${params.toString()}`, { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (requestId !== oldOpdSearchRequestRef.current) return;
            if (!response.ok) {
                setPatients([]);
                setError(data.error || "Unable to search patients.");
                return;
            }
            setPatients(Array.isArray(data.patients) ? data.patients as Patient[] : []);
        } catch {
            if (requestId !== oldOpdSearchRequestRef.current) return;
            setPatients([]);
            setError("Unable to search patients. Check your connection and try again.");
        } finally {
            if (requestId === oldOpdSearchRequestRef.current) setLoadingPatients(false);
        }
    };

    const validatePatientIfNeeded = () => {
        const nextErrors: Partial<Record<keyof PatientForm, string>> = {};
        const editingOldOpdPatient = Boolean(selectedPatient && !editingVisit && visitForm.visit_type === "OPD_OLD");
        if (selectedPatient && !editingVisit && !editingOldOpdPatient) return nextErrors;
        if (requiresExistingPatient && !showOverride && !editingOldOpdPatient) return nextErrors;

        const age = Number(patientForm.age);
        if (!patientForm.full_name.trim()) nextErrors.full_name = "Patient name is required.";
        if (!patientForm.age.trim()) nextErrors.age = "Age is required.";
        else if (!Number.isInteger(age) || age < 0 || age > 150) nextErrors.age = "Age must be 0 to 150.";
        if (!patientForm.gender) nextErrors.gender = "Gender is required.";
        if (patientForm.phone.trim() && !/^\d{10}$/.test(patientForm.phone.trim())) nextErrors.phone = "Enter a 10 digit phone number.";
        return nextErrors;
    };

    const validateVisit = () => {
        const nextErrors: Partial<Record<keyof VisitForm, string>> = {};
        if (requiresExistingPatient && !selectedPatient && !showOverride) {
            nextErrors.patient_id = "Select an existing patient for this OPD type.";
        }
        if (requiresExistingPatient && showOverride && !visitForm.override_reason.trim()) {
            nextErrors.override_reason = "Enter the reason for creating a new UHID.";
        }
        if (!visitForm.doctor_id) nextErrors.doctor_id = "Select a doctor.";
        if (visitForm.visit_type === "REFERRAL" && !visitForm.referred_by_doctor_id) {
            nextErrors.referred_by_doctor_id = "Select the doctor who referred this patient.";
        }
        if (visitForm.referred_by_doctor_id && visitForm.referred_by_doctor_id === visitForm.doctor_id) {
            nextErrors.referred_by_doctor_id = "Referring doctor must be different from consulting doctor.";
        }
        if (!visitForm.visit_date) nextErrors.visit_date = "Visit date is required.";
        const feeText = visitForm.fee_charged.trim();
        const feeValue = Number(feeText);
        if (!feeText) nextErrors.fee_charged = "Enter the fee amount.";
        else if (!/^\d+(\.\d{1,2})?$/.test(feeText) || !Number.isFinite(feeValue) || feeValue < 0) {
            nextErrors.fee_charged = "Enter a valid fee amount.";
        }
        if (visitForm.payment_mode === "FREE" && feeWaiverReasonRequired && !visitForm.fee_waived_reason.trim()) {
            nextErrors.fee_waived_reason = "Reason is required for FREE.";
        }
        return nextErrors;
    };

    const createPatientRecord = async () => {
        const age = Number(patientForm.age);
        const response = await fetch("/api/hms/staff/patients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: patientForm.full_name.trim(),
                age,
                gender: patientForm.gender,
                phone: patientForm.phone.trim() || null,
                city: patientForm.city.trim() || null,
                location: patientForm.location.trim() || null,
                address: patientForm.address.trim() || null,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setPatientErrors(data.fieldErrors || {});
            throw new Error(data.error || "Unable to register patient.");
        }
        return data.patient as Patient;
    };

    const updateSelectedPatientContact = async (patient: Patient, includeDemographics = false) => {
        const response = await fetch("/api/hms/staff/patients", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                patient_id: patient.patient_id,
                full_name: includeDemographics ? patientForm.full_name.trim() : patient.full_name || patientForm.full_name.trim(),
                age: includeDemographics ? Number(patientForm.age) : patient.age ?? Number(patientForm.age),
                gender: includeDemographics ? patientForm.gender : patient.gender || patientForm.gender,
                phone: patientForm.phone.trim() || null,
                city: patientForm.city.trim() || null,
                location: patientForm.location.trim() || null,
                address: patientForm.address.trim() || null,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setPatientErrors(data.fieldErrors || {});
            throw new Error(data.error || "Unable to update patient contact details.");
        }
        return data.patient as Patient;
    };

    const openEditPatient = (patient: Patient) => {
        setEditingPatient(patient);
        setEditPatientForm({
            full_name: patient.full_name || "",
            age: patient.age === null || patient.age === undefined ? "" : String(patient.age),
            gender: patient.gender || "",
            phone: patient.phone || "",
            city: patient.city || "",
            location: patient.location || "",
            address: patient.address || "",
        });
        setEditPatientErrors({});
        setError("");
        setSuccess("");
    };

    const updateEditPatientForm = (field: keyof PatientForm, value: string) => {
        const nextValue = field === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value;
        setEditPatientForm((prev) => ({ ...prev, [field]: nextValue }));
        setEditPatientErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const validatePatientEdit = () => {
        const nextErrors: Partial<Record<keyof PatientForm, string>> = {};
        const age = Number(editPatientForm.age);
        if (!editPatientForm.full_name.trim()) nextErrors.full_name = "Patient name is required.";
        if (!editPatientForm.age.trim()) nextErrors.age = "Age is required.";
        else if (!Number.isInteger(age) || age < 0 || age > 150) nextErrors.age = "Age must be 0 to 150.";
        if (!editPatientForm.gender) nextErrors.gender = "Sex is required.";
        if (editPatientForm.phone.trim() && !/^\d{10}$/.test(editPatientForm.phone.trim())) nextErrors.phone = "Enter a 10 digit phone number.";
        return nextErrors;
    };

    const savePatientEdit = async () => {
        if (!editingPatient) return;
        const nextErrors = validatePatientEdit();
        setEditPatientErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setSavingPatientEdit(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch("/api/hms/staff/patients", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patient_id: editingPatient.patient_id,
                    full_name: editPatientForm.full_name.trim(),
                    age: Number(editPatientForm.age),
                    gender: editPatientForm.gender,
                    phone: editPatientForm.phone.trim() || null,
                    city: editPatientForm.city.trim() || null,
                    location: editPatientForm.location.trim() || null,
                    address: editPatientForm.address.trim() || null,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setEditPatientErrors(data.fieldErrors || {});
                throw new Error(data.error || "Unable to update patient.");
            }
            const updated = data.patient as Patient;
            setPatients((prev) => prev.map((patient) => patient.patient_id === updated.patient_id ? { ...patient, ...updated } : patient));
            if (selectedPatient?.patient_id === updated.patient_id) {
                setSelectedPatient((prev) => prev ? { ...prev, ...updated } : prev);
                setPatientForm({
                    full_name: updated.full_name || "",
                    age: updated.age === null || updated.age === undefined ? "" : String(updated.age),
                    gender: updated.gender || "",
                    phone: updated.phone || "",
                    city: updated.city || "",
                    location: updated.location || "",
                    address: updated.address || "",
                });
            }
            setEditingPatient(null);
            setSuccess("Patient details updated.");
            await loadPatients();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Unable to update patient.");
        } finally {
            setSavingPatientEdit(false);
        }
    };

    const createVisitRecord = async (patientId: number) => {
        const response = await fetch("/api/hms/staff/visits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                patient_id: patientId,
                doctor_id: Number(visitForm.doctor_id),
                referred_by_doctor_id: visitForm.visit_type === "REFERRAL" ? Number(visitForm.referred_by_doctor_id) : null,
                referring_prescription_id: null,
                visit_date: visitForm.visit_date,
                visit_type: visitForm.visit_type,
                payment_mode: visitForm.payment_mode,
                payment_status: visitForm.payment_status,
                fee_charged: Number(visitForm.fee_charged),
                fee_waived_reason: visitForm.fee_waived_reason.trim() || null,
                fee_waiver_reason_source: visitForm.fee_waiver_reason_source || null,
                override_reason: showOverride ? visitForm.override_reason.trim() : null,
                temp_token_registration_id: selectedTempToken?.registration_id ?? null,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setVisitErrors(data.fieldErrors || {});
            throw new Error(data.error || "Unable to create visit.");
        }
        return data.visit as Visit;
    };

    const updateWaitingVisit = async (patientId: number) => {
        if (!editingVisit) throw new Error("No waiting visit is selected for editing.");
        const originalPatient = editingVisit.patient;
        const originalValues = {
            full_name: originalPatient.full_name || "",
            age: originalPatient.age === null || originalPatient.age === undefined ? "" : String(originalPatient.age),
            gender: originalPatient.gender || "",
            phone: originalPatient.phone || "",
            city: originalPatient.city || "",
            location: originalPatient.location || "",
            address: originalPatient.address || "",
        };
        const currentValues = {
            full_name: patientForm.full_name,
            age: patientForm.age,
            gender: patientForm.gender,
            phone: patientForm.phone,
            city: patientForm.city,
            location: patientForm.location,
            address: patientForm.address,
        };
        const patientChanges = Object.fromEntries(
            (Object.keys(currentValues) as Array<keyof typeof currentValues>)
                .filter((field) => currentValues[field] !== originalValues[field])
                .map((field) => [field, currentValues[field]])
        );
        const response = await fetch(`/api/hms/staff/visits/${editingVisit.visit_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                patient_id: patientId,
                doctor_id: Number(visitForm.doctor_id),
                patient_changes: patientChanges,
                fee_charged: Number(visitForm.fee_charged),
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setPatientErrors(data.fieldErrors || {});
            setVisitErrors(data.fieldErrors || {});
            throw new Error(data.error || "Unable to update waiting visit.");
        }
        return data.visit as Visit;
    };

    const saveRegistration = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        setCreatedVisit(null);

        const nextPatientErrors = validatePatientIfNeeded();
        const nextVisitErrors = validateVisit();
        setPatientErrors(nextPatientErrors);
        setVisitErrors(nextVisitErrors);
        if (Object.keys(nextPatientErrors).length > 0 || Object.keys(nextVisitErrors).length > 0) {
            setError("Please correct the highlighted fields.");
            return;
        }

        setSubmittingRegistration(true);

        try {
            const patient = editingVisit
                ? selectedPatient
                : selectedPatient
                ? await updateSelectedPatientContact(selectedPatient, visitForm.visit_type === "OPD_OLD")
                : canCreateNewPatient
                    ? await createPatientRecord()
                    : null;
            if (!patient) throw new Error("Select an existing patient for this OPD type.");

            const visit = editingVisit
                ? await updateWaitingVisit(patient.patient_id)
                : await createVisitRecord(patient.patient_id);
            const selectedDoctorForVisit = doctors.find((doctor) => String(doctor.doctor_id) === visitForm.doctor_id);
            const visitWithDetails: Visit = {
                ...visit,
                patient: visit.patient || {
                    patient_id: patient.patient_id,
                    full_name: patient.full_name,
                    uhid: patient.uhid,
                    phone: patient.phone,
                    age: patient.age,
                    gender: patient.gender,
                },
                doctor: visit.doctor || {
                    doctor_id: Number(visitForm.doctor_id),
                    doctor_name: selectedDoctorForVisit?.doctor_name || null,
                    room_no: selectedDoctorForVisit?.room_no || null,
                },
            };
            focusPrintSlipAfterSave.current = !editingVisit;
            setCreatedVisit(visitWithDetails);
            setSuccess(editingVisit
                ? `OPD ${visitWithDetails.visit_number || visitWithDetails.visit_id} updated. Fee ${formatCurrency(visitWithDetails.fee_charged)}.`
                : `OPD ${visitWithDetails.visit_number || visitWithDetails.visit_id} saved. Fee ${formatCurrency(visitWithDetails.fee_charged)}.`);
            if (!visitForm.patient_id) {
                setPatients((prev) => [patient, ...prev]);
            }
            setPatientForm(emptyPatientForm);
            setSelectedPatient(null);
            setSelectedTempToken(null);
            setEditingVisit(null);
            setExactUhid("");
            setShowOverride(false);
            setDuplicateWarningDismissed(false);
            setVisitForm((prev) => ({
                ...prev,
                patient_id: "",
                referred_by_doctor_id: "",
                referring_prescription_id: "",
                fee_waived_reason: "",
                fee_waiver_reason_source: "",
                override_reason: "",
                payment_mode: "CASH",
                payment_status: "PAID",
                fee_charged: formatFeeInput(estimatedFee),
            }));
            setFeeManuallyEdited(false);
            await loadPatients();
            await loadVisits();
            await loadTempTokens();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Unable to save OPD registration.");
        } finally {
            setSubmittingRegistration(false);
        }
    };

    const updateStaffVisitStatus = async (visit: Visit, action: "CANCEL") => {
        setError("");
        setSuccess("");
        setActingVisitId(visit.visit_id);

        try {
            const response = await fetch(`/api/hms/staff/visits/${visit.visit_id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to update visit.");
                return;
            }

            setSuccess("Visit cancelled.");
            setCancelVisit(null);
            await loadVisits();
        } catch {
            setError("Unable to update visit. Check your connection and try again.");
        } finally {
            setActingVisitId(null);
        }
    };

    return (
        <div className="w-full">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-black">Reception</p>
                    <h1 className="mt-1 text-2xl font-bold text-black sm:text-3xl">{title}</h1>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    {mode === "patients" && (
                        <div>
                            <label className="mb-1 block text-xs font-medium text-black">Date</label>
                            <input
                                type="date"
                                value={patientDate}
                                onChange={(event) => {
                                    setPatientDate(event.target.value);
                                    setPatientPage(1);
                                }}
                                className="h-10 rounded-lg border border-black px-3 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                            />
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            void loadPatients();
                            void loadVisits();
                        }}
                        disabled={loadingVisits || loadingPatients}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-black px-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
                    >
                        <RefreshCw size={15} className={loadingVisits || loadingPatients ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && <HmsStatusAlert tone="error" message={error} onDismiss={clearError} />}
            {success && <HmsStatusAlert tone="success" message={success} onDismiss={clearSuccess} />}

            {mode !== "patients" && <Metrics totals={visitsData?.totals} />}
            {mode === "patients" && (
                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                    <Metric label="Patients" value={patientCounts.total} />
                    <Metric label="Listed" value={patientCounts.listed} />
                    <Metric label="With Mobile" value={patientCounts.withPhone} />
                </div>
            )}

            {mode === "registration" && (
                <>
                <form
                    ref={registrationFormRef}
                    onSubmit={saveRegistration}
                    data-registration-keyboard-flow={canCreateNewPatient || editingVisit ? "patient-entry" : undefined}
                    onKeyDown={(event) => {
                        if (
                            (event.ctrlKey || event.metaKey) &&
                            event.key.toLowerCase() === "s" &&
                            !event.repeat &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            if (!submittingRegistration) event.currentTarget.requestSubmit();
                            return;
                        }

                        if ((event.key === "Tab" || event.key === "Enter") && event.currentTarget.dataset.registrationKeyboardFlow === "patient-entry") {
                            const currentStep = (event.target as HTMLElement).closest<HTMLElement>("[data-registration-keyboard-step]")?.dataset.registrationKeyboardStep;
                            const form = event.currentTarget;
                            const steps = REGISTRATION_KEYBOARD_STEPS.map((step) =>
                                form.querySelector<HTMLElement>(`[data-registration-keyboard-step="${step}"]`)
                            );
                            if (!currentStep || steps.some((step) => !step || (step instanceof HTMLButtonElement && step.disabled))) return;

                            const currentIndex = REGISTRATION_KEYBOARD_STEPS.indexOf(currentStep);
                            if (currentIndex < 0) return;
                            if (currentStep === "save" && event.key === "Enter") {
                                event.preventDefault();
                                return;
                            }
                            const direction = event.key === "Tab" && event.shiftKey ? -1 : 1;
                            const nextStep = steps[currentIndex + direction];
                            if (!nextStep) return;

                            event.preventDefault();
                            nextStep.focus();
                        }
                    }}
                    className="rounded-lg border border-black bg-white"
                >
                    <div className="flex items-center justify-between gap-3 border-b border-black px-4 py-3">
                        <h2 className="text-sm font-semibold text-black">OPD Registration</h2>
                        <button
                            type="button"
                            onClick={resetRegistrationForm}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black text-black hover:bg-black hover:text-white"
                            title="Reset form (Alt+R)"
                            aria-label="Reset registration form (Alt+R)"
                        >
                            <RefreshCw size={15} />
                        </button>
                    </div>
                    <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-5 p-4">
                        {showTempTokenPanel ? (
                            <div className="rounded-lg border border-black bg-white p-2.5">
                                <div className="mb-2.5 flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-black">Pre-registration Tokens</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selectedTempToken && (
                                            <button
                                                type="button"
                                                onClick={clearSelectedTempToken}
                                                className="rounded-lg border border-black px-2 py-1 text-xs font-semibold text-black hover:bg-black hover:text-white"
                                            >
                                                Clear
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setTempTokenPanelCollapsed((value) => !value)}
                                            aria-label={tempTokenPanelCollapsed ? "Expand pre-registration tokens" : "Collapse pre-registration tokens"}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black text-black hover:bg-black hover:text-white"
                                        >
                                            {tempTokenPanelCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                                        </button>
                                    </div>
                                </div>
                                {!tempTokenPanelCollapsed && (
                                    <>
                                        <div className="flex flex-col gap-2 md:flex-row md:items-end">
                                            <div className="relative flex-1">
                                                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black" />
                                                <input
                                                    value={tempTokenSearch}
                                                    onChange={(event) => setTempTokenSearch(event.target.value)}
                                                    placeholder="Search token, name, age, sex, phone, room"
                                                    className="w-full rounded-lg border border-black py-2 pl-9 pr-9 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                                                />
                                                {tempTokenSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setTempTokenSearch("")}
                                                        aria-label="Clear pre-registration token search"
                                                        className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full border border-black bg-white p-1 text-black hover:bg-black hover:text-white"
                                                    >
                                                        <XCircle size={14} />
                                                    </button>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => void loadTempTokens()}
                                                disabled={loadingTempTokens}
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-black px-3 text-sm font-semibold text-black hover:bg-black hover:text-white disabled:opacity-60"
                                            >
                                                {loadingTempTokens ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                Refresh
                                            </button>
                                        </div>
                                        <div className="mt-2.5 max-h-16 space-y-1.5 overflow-auto pr-1">
                                            {loadingTempTokens ? (
                                                <div className="flex items-center gap-2 text-sm text-black">
                                                    <Loader2 size={14} className="animate-spin" />
                                                    Loading pre-registration tokens
                                                </div>
                                            ) : tempTokens.length === 0 ? (
                                                <div className="text-sm text-black">No pre-registration tokens found.</div>
                                            ) : (
                                                tempTokens.map((tempToken) => {
                                                    const ageSex = [tempToken.age ?? null, tempToken.gender ? tempToken.gender.slice(0, 1).toUpperCase() : null]
                                                        .filter(Boolean)
                                                        .join("/");
                                                    const active = selectedTempToken?.registration_id === tempToken.registration_id;
                                                    return (
                                                        <button
                                                            key={tempToken.registration_id}
                                                            type="button"
                                                            onClick={() => selectTempToken(tempToken)}
                                                            className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm leading-tight ${
                                                                active ? "border-black bg-black text-white" : "border-black bg-white text-black hover:bg-black hover:text-white"
                                                            }`}
                                                        >
                                                            <span className="shrink-0 font-semibold">{tempToken.token}</span>
                                                            <span className="min-w-0 flex-1 truncate font-medium">
                                                                {tempToken.patient_name || "Unnamed"}
                                                                {ageSex ? ` (${ageSex})` : ""}
                                                            </span>
                                                            {tempToken.phone ? <span className="shrink-0 text-xs font-medium">M {tempToken.phone}</span> : null}
                                                            {tempToken.doctor?.room_no ? <span className="shrink-0 text-xs font-semibold">R{tempToken.doctor.room_no}</span> : null}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : null}

                            {!editingVisit && (
                                <>
                                    {visitForm.visit_type === "OPD_OLD" ? (
                                        <OldOpdPatientSearch
                                            patients={patients}
                                            loading={loadingPatients}
                                            search={oldOpdSearch}
                                            searchMode={oldOpdSearchMode}
                                            submitted={oldOpdSearchSubmitted}
                                            selectedPatientId={visitForm.patient_id}
                                            formats={visitsData?.searchIdFormats}
                                            roomNumber={doctors.find((queue) => String(queue.doctor_id) === visitForm.doctor_id)?.room_no || ""}
                                            onSearchChange={(value) => {
                                                oldOpdSearchRequestRef.current += 1;
                                                setLoadingPatients(false);
                                                setOldOpdSearch(value);
                                                setPatients([]);
                                                setOldOpdSearchSubmitted(false);
                                            }}
                                            onModeChange={(value) => {
                                                oldOpdSearchRequestRef.current += 1;
                                                setLoadingPatients(false);
                                                setOldOpdSearchMode(value);
                                                setOldOpdSearch("");
                                                setPatients([]);
                                                setOldOpdSearchSubmitted(false);
                                            }}
                                            onSearch={(searchMode, value) => void searchOldOpdPatient(searchMode, value)}
                                            onSelect={selectPatient}
                                            onClearSelected={clearSelectedPatient}
                                        />
                                    ) : (
                                        <PatientSearch
                                            patients={registrationPatientResults}
                                            loading={loadingPatients}
                                            search={patientSearch}
                                            selectedPatientId={visitForm.patient_id}
                                            onSearchChange={(value) => {
                                                setPatientSearch(value);
                                                setPatients([]);
                                                setPatientPagination({
                                                    page: 1,
                                                    page_size: PATIENT_PAGE_SIZE,
                                                    total: 0,
                                                    total_pages: 1,
                                                });
                                            }}
                                            onSearch={() => void loadPatients()}
                                            onSelect={selectPatient}
                                            onClearSelected={clearSelectedPatient}
                                            compact
                                        />
                                    )}

                                    {likelyDuplicateWarning && (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                            Similar patients are listed above. Select the existing patient if this is not a new UHID.
                                            <button type="button" onClick={() => setDuplicateWarningDismissed(true)} className="ml-2 font-semibold underline">
                                                Dismiss
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            <div>
                                <div className="mb-3 flex items-center gap-2">
                                    <UserRound size={17} />
                                    <h3 className="text-sm font-semibold text-black">
                                        {editingVisit ? "Edit Patient Details" : selectedPatient ? "Selected Patient" : canCreateNewPatient ? "New Patient Details" : "Patient Selection Required"}
                                    </h3>
                                </div>
                                        {selectedPatient && !editingVisit && visitForm.visit_type !== "OPD_OLD" ? (
                                            <div className="space-y-3">
                                        <div className="rounded-lg border border-black bg-white px-3 py-3 text-sm">
                                            <div className="grid gap-2 md:grid-cols-4">
                                                <div>
                                                    <p className="text-xs font-medium text-black">UHID</p>
                                                    <p className="font-semibold text-black">{selectedPatient.uhid || "-"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-medium text-black">Name</p>
                                                    <p className="font-semibold text-black">{selectedPatient.full_name || "Unnamed"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-medium text-black">Age</p>
                                                    <p className="font-semibold text-black">{selectedPatient.age ?? "-"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-medium text-black">Sex</p>
                                                    <p className="font-semibold text-black">{selectedPatient.gender || "-"}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <Field label="Mobile No." value={patientForm.phone} error={patientErrors.phone} onChange={(value) => updatePatientForm("phone", value)} />
                                            <Field label="City" value={patientForm.city} error={patientErrors.city} onChange={(value) => updatePatientForm("city", value)} />
                                            <Field label="Location" value={patientForm.location} error={patientErrors.location} onChange={(value) => updatePatientForm("location", value)} />
                                            <div className="md:col-span-2">
                                                <Field label="Address" value={patientForm.address} error={patientErrors.address} onChange={(value) => updatePatientForm("address", value)} />
                                            </div>
                                        </div>
                                    </div>
                                        ) : canCreateNewPatient || editingVisit || (selectedPatient && visitForm.visit_type === "OPD_OLD") ? (
                                            <div className="grid gap-3 md:grid-cols-2">
                                        {selectedPatient && !editingVisit && visitForm.visit_type === "OPD_OLD" && (
                                            <div className="md:col-span-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                                                UHID <span className="ml-1 font-semibold text-black">{selectedPatient.uhid || "-"}</span>
                                            </div>
                                        )}
                                        {showOverride && !editingVisit && (
                                            <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                                Exact UHID was not found in this hospital. Create a new UHID only if the patient cannot be matched.
                                            </div>
                                        )}
                                        <Field label="Name" value={patientForm.full_name} error={patientErrors.full_name} onChange={(value) => updatePatientForm("full_name", value)} required registrationStep="patient-name" />
                                        <Field label="Mobile No." value={patientForm.phone} error={patientErrors.phone} onChange={(value) => updatePatientForm("phone", value)} />
                                        <Field
                                            label="Age"
                                            value={patientForm.age}
                                            error={patientErrors.age}
                                            onChange={(value) => updatePatientForm("age", value)}
                                            inputMode="numeric"
                                            required
                                            registrationStep="patient-age"
                                        />
                                        <Select label="Sex" value={patientForm.gender} error={patientErrors.gender} onChange={(value) => updatePatientForm("gender", value)} options={["MALE", "FEMALE", "OTHER"]} required registrationStep="patient-sex" />
                                        <Field label="City" value={patientForm.city} error={patientErrors.city} onChange={(value) => updatePatientForm("city", value)} />
                                        <Field label="Location" value={patientForm.location} error={patientErrors.location} onChange={(value) => updatePatientForm("location", value)} />
                                        <div className="md:col-span-2">
                                            <Field label="Address" value={patientForm.address} error={patientErrors.address} onChange={(value) => updatePatientForm("address", value)} />
                                        </div>
                                {showOverride && !editingVisit && (
                                            <div className="md:col-span-2">
                                                <Field label="Override Reason" value={visitForm.override_reason} error={visitErrors.override_reason} onChange={(value) => updateVisitForm("override_reason", value)} required />
                                            </div>
                                        )}
                                        {showOverride && (
                                            <div className="md:col-span-2">
                                                <button type="button" onClick={() => setShowOverride(false)} className="text-sm font-semibold text-black underline">
                                                    Go back to selecting existing patient
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                        <p className="text-sm font-medium text-amber-900">Select an existing patient from the search results before saving this OPD type.</p>
                                        {visitForm.visit_type === "OPD_OLD"
                                            ? <p className="text-xs text-amber-800">Search by patient name/phone, configured UHID, or OPD number above.</p>
                                            : <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                                                <Field label="Exact UHID Lookup" value={exactUhid} error={visitErrors.patient_id} onChange={setExactUhid} clearable onClear={() => setExactUhid("")} onEnter={() => void lookupExactUhid()} />
                                                <button type="button" onClick={() => void lookupExactUhid()} disabled={loadingPatients} className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
                                                    {loadingPatients && <Loader2 size={15} className="animate-spin" />}
                                                    Lookup UHID
                                                </button>
                                            </div>}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-black p-4 lg:border-l lg:border-t-0">
                            <h3 className="mb-3 text-sm font-semibold text-black">OPD Details</h3>
                            <div className="grid gap-3">
                                <Select
                                    label="OPD Type"
                                    registrationStep="opd-type"
                                    value={visitForm.visit_type}
                                    error={visitErrors.visit_type}
                                    onChange={(value) => {
                                        oldOpdSearchRequestRef.current += 1;
                                        setLoadingPatients(false);
                                        updateVisitForm("visit_type", value);
                                        setPatients([]);
                                        setOldOpdSearchSubmitted(false);
                                        if (value !== "REFERRAL") {
                                            updateVisitForm("referred_by_doctor_id", "");
                                            updateVisitForm("referring_prescription_id", "");
                                        }
                                        if (!["OPD_OLD", "REFERRAL"].includes(value)) setShowOverride(false);
                                    }}
                                    options={[
                                        { value: "OPD_NEW", label: "New OPD" },
                                        { value: "OPD_OLD", label: "Old OPD" },
                                        { value: "REFERRAL", label: "Referral" },
                                        { value: "LAB_ONLY", label: "Test Only" },
                                    ]}
                                />
                                {(visitForm.visit_type === "OPD_OLD" || visitForm.visit_type === "REFERRAL") && selectedPatient && (
                                    <div className="rounded-lg border border-black bg-white px-3 py-2 text-xs font-bold text-black">
                                        {checkingFollowup ? (
                                            <span className="inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> {visitForm.visit_type === "REFERRAL" ? "Checking referral window" : "Checking same-doctor follow-up"}</span>
                                        ) : followupEligibility?.eligible ? (
                                            <span>{visitForm.visit_type === "REFERRAL" ? "Referral window valid" : "Same-doctor follow-up valid"}. Payment suggested as FREE{followupEligibility.valid_until ? ` until ${followupEligibility.valid_until}` : ""}.</span>
                                        ) : followupEligibility ? (
                                            <span>{followupEligibility.reason} Normal payment applies.</span>
                                        ) : (
                                            <span>{visitForm.visit_type === "REFERRAL" ? "Select referred by, doctor, and date to check referral window." : "Select doctor and date to check same-doctor follow-up."}</span>
                                        )}
                                    </div>
                                )}
                                {visitForm.visit_type === "REFERRAL" && (
                                    <>
                                        <Select
                                            label="Referred By"
                                            value={visitForm.referred_by_doctor_id}
                                            error={visitErrors.referred_by_doctor_id}
                                            onChange={(value) => {
                                                updateVisitForm("referred_by_doctor_id", value);
                                                updateVisitForm("referring_prescription_id", "");
                                            }}
                                            options={doctors
                                                .filter((doctor) => String(doctor.doctor_id) !== visitForm.doctor_id)
                                                .map((doctor) => ({
                                                    value: String(doctor.doctor_id),
                                                    label: doctorOptionLabel(doctor),
                                                }))}
                                            required
                                        />
                                    </>
                                )}
                                <Select
                                    label="Room / Doctor"
                                    registrationStep="doctor"
                                    value={visitForm.doctor_id}
                                    error={visitErrors.doctor_id}
                                    onChange={(value) => {
                                        updateVisitForm("doctor_id", value);
                                        if (value === visitForm.referred_by_doctor_id) {
                                            updateVisitForm("referred_by_doctor_id", "");
                                            updateVisitForm("referring_prescription_id", "");
                                        } else {
                                            updateVisitForm("referring_prescription_id", "");
                                        }
                                    }}
                                    options={doctors.map((doctor) => ({
                                        value: String(doctor.doctor_id),
                                        label: doctorOptionLabel(doctor),
                                        searchLabel: doctorOptionSearchLabel(doctor),
                                    }))}
                                    required
                                />
                                <Field label="Date" type="date" value={visitForm.visit_date} error={visitErrors.visit_date} onChange={(value) => updateVisitForm("visit_date", value)} required />
                                <Select label="Payment" value={visitForm.payment_mode} error={visitErrors.payment_mode} onChange={(value) => updateVisitForm("payment_mode", value)} options={["CASH", "UPI", "CARD", "FREE"]} />
                                <div className="grid grid-cols-2 gap-3">
                                    <Select label="Payment Status" value={visitForm.payment_status} error={visitErrors.payment_status} onChange={(value) => updateVisitForm("payment_status", value)} options={paymentStatusOptions} />
                                    <Field label="Fee (Rs.)" inputMode="decimal" value={visitForm.fee_charged} error={visitErrors.fee_charged} onChange={(value) => updateVisitForm("fee_charged", value)} required />
                                </div>
                                {visitForm.payment_mode === "FREE" && (
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-600">Waiver Reason{feeWaiverReasonRequired ? " *" : ""}</label>
                                        <div className="relative">
                                            <input
                                                value={visitForm.fee_waived_reason}
                                                onFocus={() => setWaiverReasonOpen(true)}
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    const isPreset = (visitsData?.feePolicy?.waiverReasonOptions || []).includes(value);
                                                    updateWaiverReason(value, value ? (isPreset ? "PRESET" : "CUSTOM") : "");
                                                }}
                                                onBlur={() => window.setTimeout(() => setWaiverReasonOpen(false), 120)}
                                                placeholder="Waiver reason (optional)"
                                                className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${visitErrors.fee_waived_reason ? "border-red-600" : "border-black"}`}
                                            />
                                            <button
                                                type="button"
                                                aria-label="Show saved waiver reasons"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => setWaiverReasonOpen((open) => !open)}
                                                className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center text-gray-600 hover:text-black"
                                            >
                                                <ChevronDown size={16} />
                                            </button>
                                            {waiverReasonOpen && (visitsData?.feePolicy?.waiverReasonOptions || []).length > 0 && (
                                                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-black bg-white py-1 shadow-lg">
                                                    {(visitsData?.feePolicy?.waiverReasonOptions || []).map((option) => (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            onMouseDown={(event) => event.preventDefault()}
                                                            onClick={() => {
                                                                updateWaiverReason(option, "PRESET");
                                                                setWaiverReasonOpen(false);
                                                            }}
                                                            className="block w-full px-3 py-2 text-left text-sm text-black hover:bg-gray-100"
                                                        >
                                                            {option}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {visitErrors.fee_waived_reason && <p className="mt-1 text-xs text-red-600">{visitErrors.fee_waived_reason}</p>}
                                    </div>
                                )}
                            </div>

                            {editingVisit && <p className="mt-4 border border-black px-3 py-2 text-xs font-semibold text-black">Editing waiting visit {editingVisit.visit_number || editingVisit.visit_id}</p>}
                            <button type="submit" data-registration-keyboard-step="save" aria-keyshortcuts="Control+S Meta+S" disabled={submittingRegistration} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
                                {submittingRegistration ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                {editingVisit ? "Update Waiting Visit" : selectedPatient ? "Save OPD for selected patient" : "Save OPD Registration"}
                            </button>
                            {editingVisit && <button type="button" onClick={cancelEditVisit} disabled={submittingRegistration} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-black px-4 py-2.5 text-sm font-semibold text-black hover:bg-black hover:text-white disabled:opacity-60">Cancel Edit</button>}

                            {createdVisit && (
                                <a ref={printSlipRef} href={`/hms/staff/visits/${createdVisit.visit_id}/print?printType=HEADER&keyboardPrint=1`} target={opdSlipWindowName(createdVisit)} rel="noopener,noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-black px-4 py-2.5 text-sm font-semibold text-black hover:bg-black hover:text-white">
                                    <Printer size={16} />
                                    Print Slip
                                </a>
                            )}
                        </div>
                    </div>
                </form>
                <div className="mt-5">
                <VisitsTable visits={latestVisitsFirst(visitsData?.visits || []).slice(0, 25)} loading={loadingVisits} actingVisitId={actingVisitId} onCancel={(visit) => setCancelVisit(visit)} onEdit={openEditVisit} compact />
                </div>
                </>
            )}

            {mode === "patients" && (
                <div className="space-y-3">
                    <PatientSearch
                        patients={patients}
                        loading={loadingPatients}
                        search={patientSearch}
                        selectedPatientId={visitForm.patient_id}
                        onSearchChange={(value) => {
                            setPatientSearch(value);
                            setPatientPage(1);
                        }}
                        onSearch={() => void loadPatients()}
                        onSelect={selectPatient}
                        onClearSelected={clearSelectedPatient}
                        onEdit={openEditPatient}
                        fullHeight
                        selectable={false}
                    />
                    <PaginationControls
                        page={patientPagination.page}
                        totalPages={patientPagination.total_pages}
                        total={patientPagination.total}
                        onPageChange={setPatientPage}
                    />
                </div>
            )}

            {mode === "visits" && (
                <div className="space-y-5">
                    <VisitsTable visits={visitsData?.visits || []} loading={loadingVisits} actingVisitId={actingVisitId} onCancel={(visit) => setCancelVisit(visit)} onEdit={openEditVisit} />
                    <PaginationControls
                        page={visitPage}
                        totalPages={visitTotalPages}
                        total={visitPagination.total}
                        onPageChange={setVisitPage}
                    />
                    <DoctorQueues queues={doctors} />
                </div>
            )}

            {editingPatient && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-base font-semibold text-black">Edit Patient</h2>
                            <button type="button" onClick={() => setEditingPatient(null)} className="rounded-lg border border-black p-2 text-black hover:bg-black hover:text-white" aria-label="Close edit patient">
                                <XCircle size={16} />
                            </button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Name" value={editPatientForm.full_name} error={editPatientErrors.full_name} onChange={(value) => updateEditPatientForm("full_name", value)} required />
                            <Field label="Mobile No." value={editPatientForm.phone} error={editPatientErrors.phone} onChange={(value) => updateEditPatientForm("phone", value)} />
                            <Field label="Age" value={editPatientForm.age} error={editPatientErrors.age} onChange={(value) => updateEditPatientForm("age", value)} required />
                            <Select label="Sex" value={editPatientForm.gender} error={editPatientErrors.gender} onChange={(value) => updateEditPatientForm("gender", value)} options={["MALE", "FEMALE", "OTHER"]} required />
                            <Field label="City" value={editPatientForm.city} error={editPatientErrors.city} onChange={(value) => updateEditPatientForm("city", value)} />
                            <Field label="Location" value={editPatientForm.location} error={editPatientErrors.location} onChange={(value) => updateEditPatientForm("location", value)} />
                            <div className="md:col-span-2">
                                <Field label="Address" value={editPatientForm.address} error={editPatientErrors.address} onChange={(value) => updateEditPatientForm("address", value)} />
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingPatient(null)} className="rounded-lg border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-black hover:text-white">
                                Cancel
                            </button>
                            <button type="button" onClick={() => void savePatientEdit()} disabled={savingPatientEdit} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
                                {savingPatientEdit && <Loader2 size={15} className="animate-spin" />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cancelVisit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
                        <div className="mb-3 flex items-center gap-2">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600">
                                <XCircle size={18} />
                            </span>
                            <h2 className="text-base font-semibold text-black">Cancel Visit</h2>
                        </div>
                        <p className="text-sm text-black">
                            Cancel {cancelVisit.visit_number || `visit ${cancelVisit.visit_id}`}?
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button type="button" onClick={() => setCancelVisit(null)} className="rounded-lg border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-black hover:text-white">
                                Keep
                            </button>
                            <button type="button" onClick={() => void updateStaffVisitStatus(cancelVisit, "CANCEL")} disabled={actingVisitId === cancelVisit.visit_id} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                                {actingVisitId === cancelVisit.visit_id && <Loader2 size={15} className="animate-spin" />}
                                Cancel Visit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Metrics({ totals }: { totals?: VisitsResponse["totals"] }) {
    return (
        <div className="mb-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Metric label="Visits" value={totals?.visits ?? 0} />
            <Metric label="Active" value={totals?.active ?? 0} />
            <Metric label="Waiting" value={totals?.waiting ?? 0} />
            <Metric label="Paid" value={totals?.paid ?? 0} />
            <Metric label="Pending" value={totals?.pending ?? 0} />
            <Metric label="Cancelled" value={totals?.cancelled ?? 0} />
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

function Field({
    label,
    value,
    error,
    onChange,
    type = "text",
    required = false,
    clearable = false,
    onClear,
    onEnter,
    inputMode,
    registrationStep,
}: {
    label: string;
    value: string;
    error?: string;
    onChange: (value: string) => void;
    type?: string;
    required?: boolean;
    clearable?: boolean;
    onClear?: () => void;
    onEnter?: () => void;
    inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
    registrationStep?: string;
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-black">{label}{required && <span className="text-red-600"> *</span>}</label>
            <div className="relative">
                <input
                    type={type}
                    inputMode={inputMode}
                    data-registration-keyboard-step={registrationStep}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (registrationStep) return;
                        if (onEnter && event.key === "Enter") {
                            event.preventDefault();
                            onEnter();
                            return;
                        }
                        focusNextOnEnter(event);
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${clearable ? "pr-9" : ""} ${error ? "border-red-600" : "border-black"}`}
                />
                {clearable && value && (
                    <button type="button" onClick={onClear} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-black hover:bg-black hover:text-white" aria-label={`Clear ${label}`}>
                        <XCircle size={14} />
                    </button>
                )}
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}

function Select({ label, value, error, onChange, options, required = false, placeholder = "Select", registrationStep }: { label: string; value: string; error?: string; onChange: (value: string) => void; options: Array<string | { value: string; label: string; searchLabel?: string }>; required?: boolean; placeholder?: string; registrationStep?: string }) {
    const doctorTypeAhead = useRef({ query: "", lastInputAt: 0 });

    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-black">{label}{required && <span className="text-red-600"> *</span>}</label>
            <select data-registration-keyboard-step={registrationStep} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => {
                if (registrationStep === "patient-sex") {
                    const selectedSex = !event.ctrlKey && !event.metaKey && !event.altKey
                        ? REGISTRATION_SEX_KEYS[event.key.toLowerCase()]
                        : undefined;
                    if (selectedSex) {
                        event.preventDefault();
                        onChange(selectedSex);
                        return;
                    }
                }
                if (registrationStep === "doctor" && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
                    event.preventDefault();
                    const now = Date.now();
                    const typed = now - doctorTypeAhead.current.lastInputAt < 900
                        ? `${doctorTypeAhead.current.query}${event.key}`
                        : event.key;
                    const doctorOptions = options.filter((option): option is { value: string; label: string; searchLabel?: string } => typeof option !== "string");
                    const normalizedQuery = typed.trim().toLocaleLowerCase();
                    let match = doctorOptions.find((option) => String(option.searchLabel || option.label).toLocaleLowerCase().startsWith(normalizedQuery));
                    if (!match) {
                        const singleKey = event.key.toLocaleLowerCase();
                        match = doctorOptions.find((option) => String(option.searchLabel || option.label).toLocaleLowerCase().startsWith(singleKey));
                        doctorTypeAhead.current.query = event.key;
                    } else {
                        doctorTypeAhead.current.query = typed;
                    }
                    doctorTypeAhead.current.lastInputAt = now;
                    if (match) onChange(match.value);
                    return;
                }
                if (!registrationStep) focusNextOnEnter(event);
            }} className={`w-full rounded-lg border px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${error ? "border-red-600" : "border-black"}`}>
            <option value="">{placeholder}</option>
                {options.map((option) => {
                    const optionValue = typeof option === "string" ? option : option.value;
                    const optionLabel = typeof option === "string" ? option : option.label;
                    return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
                })}
            </select>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}

function PaginationControls({ page, totalPages, total, onPageChange }: { page: number; totalPages: number; total: number; onPageChange: (page: number) => void }) {
    if (totalPages <= 1 && total <= 0) return null;

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black bg-white px-4 py-3 text-sm text-black">
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

function OldOpdPatientSearch({
    patients,
    loading,
    search,
    searchMode,
    submitted,
    selectedPatientId,
    formats,
    roomNumber,
    onSearchChange,
    onModeChange,
    onSearch,
    onSelect,
    onClearSelected,
}: {
    patients: Patient[];
    loading: boolean;
    search: string;
    searchMode: OldOpdSearchMode;
    submitted: boolean;
    selectedPatientId: string;
    formats?: VisitsResponse["searchIdFormats"];
    roomNumber: string;
    onSearchChange: (value: string) => void;
    onModeChange: (value: OldOpdSearchMode) => void;
    onSearch: (mode: OldOpdSearchMode, value: string) => void;
    onSelect: (patient: Patient) => void;
    onClearSelected: () => void;
}) {
    const resultsRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [highlightedPatientSelection, setHighlightedPatientSelection] = useState<{ patients: Patient[]; index: number } | null>(null);
    const highlightedPatientIndex = highlightedPatientSelection?.patients === patients ? highlightedPatientSelection.index : -1;
    const template = searchMode === "UHID" ? formats?.uhid : searchMode === "OPD" ? formats?.opd : null;
    const prefix = (template?.prefix || "").replace("{{ROOM}}", roomNumber || "ROOM");
    const showPrefix = searchMode !== "PATIENT" && Boolean(prefix) && !/[^0-9]/.test(search);
    const placeholder = searchMode === "PATIENT"
        ? "Patient name or phone"
        : template
            ? "Serial number, or enter full ID"
            : "Enter full identifier";

    useEffect(() => {
        searchInputRef.current?.focus();
    }, [searchMode]);

    useEffect(() => {
        if (highlightedPatientIndex < 0) return;
        const patient = patients[highlightedPatientIndex];
        if (!patient) return;
        const row = resultsRef.current?.querySelector<HTMLElement>(`[data-patient-id="${patient.patient_id}"]`);
        const scrollContainer = row?.closest("table")?.parentElement;
        if (!row || !scrollContainer) return;

        const rowTop = row.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
        const rowBottom = rowTop + row.offsetHeight;
        const visibleTop = scrollContainer.scrollTop;
        const visibleBottom = visibleTop + scrollContainer.clientHeight;
        if (rowTop < visibleTop || rowBottom > visibleBottom) {
            scrollContainer.scrollTop = rowTop - (scrollContainer.clientHeight - row.offsetHeight) / 2;
        }
    }, [highlightedPatientIndex, patients]);

    return (
        <div className="rounded-lg border border-black bg-white">
            <div className="space-y-3 border-b border-black p-3">
                <fieldset>
                    <legend className="mb-2 text-xs font-semibold text-black">Find existing patient</legend>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Old OPD patient search type">
                        {([
                            ["PATIENT", "Name / Phone"],
                            ["UHID", "UHID"],
                            ["OPD", "OPD No."],
                        ] as const).map(([value, label]) => (
                            <label key={value} className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${searchMode === value ? "border-black bg-black font-semibold text-white" : "border-black bg-white text-black hover:bg-gray-50"}`}>
                                <input
                                    type="radio"
                                    name="old-opd-search-mode"
                                    value={value}
                                    checked={searchMode === value}
                                    onChange={() => {
                                        setHighlightedPatientSelection(null);
                                        onModeChange(value);
                                    }}
                                    className="sr-only"
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="flex min-w-0 items-center rounded-lg border border-black focus-within:ring-2 focus-within:ring-black/10">
                        {showPrefix && (
                            <span className="max-w-[55%] shrink-0 truncate border-r border-gray-300 px-2.5 py-2 text-xs font-semibold text-gray-700" title={`${prefix}${template?.suffix || ""}`}>
                                {prefix}
                            </span>
                        )}
                        <input
                            ref={searchInputRef}
                            value={search}
                            onChange={(event) => {
                                    setHighlightedPatientSelection(null);
                                onSearchChange(event.target.value);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    if (submitted && searchMode === "PATIENT") {
                                        if (!loading && highlightedPatientIndex >= 0) {
                                            const patient = patients[highlightedPatientIndex];
                                            if (patient) onSelect(patient);
                                        }
                                    } else if (submitted && !loading && searchMode !== "PATIENT" && patients.length === 1) {
                                        onSelect(patients[0]);
                                    } else if (submitted && !loading && searchMode !== "PATIENT" && patients.length > 1) {
                                        resultsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
                                    } else {
                                        onSearch(searchMode, search);
                                    }
                                } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && submitted && !loading && patients.length > 0 && searchMode === "PATIENT") {
                                    event.preventDefault();
                                    setHighlightedPatientSelection((current) => {
                                        const currentIndex = current?.patients === patients ? current.index : -1;
                                        if (event.key === "ArrowDown") return { patients, index: currentIndex < 0 ? 0 : Math.min(currentIndex + 1, patients.length - 1) };
                                        return { patients, index: currentIndex < 0 ? patients.length - 1 : Math.max(currentIndex - 1, 0) };
                                    });
                                } else if (event.key === "ArrowDown" && submitted && patients.length > 0) {
                                    event.preventDefault();
                                    resultsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
                                }
                            }}
                            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm text-black outline-none"
                            placeholder={placeholder}
                            aria-label={searchMode === "PATIENT" ? "Search patient name or phone" : `Search by ${searchMode === "UHID" ? "UHID" : "OPD number"}`}
                        />
                        {search && (
                            <button type="button" onClick={() => onSearchChange("")} className="mr-1 rounded-full p-1 text-gray-600 hover:bg-gray-100" aria-label="Clear search">
                                <XCircle size={15} />
                            </button>
                        )}
                    </div>
                    <button type="button" onClick={() => onSearch(searchMode, search)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        <Search size={15} />
                        Search
                    </button>
                </div>
                {searchMode !== "PATIENT" && (
                    <p className="text-xs text-gray-600">Enter the serial after the shown prefix, or enter a full UHID/OPD number to search an earlier year.</p>
                )}
            </div>
            {selectedPatientId && (
                <div className="border-b border-black bg-white px-3 py-2 text-xs text-black">
                    Existing patient selected.
                    <button type="button" onClick={onClearSelected} className="ml-2 font-semibold underline">Clear selection</button>
                </div>
            )}
            {submitted && (
                <div
                    ref={resultsRef}
                    onKeyDown={(event) => {
                        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                        const target = event.target as HTMLElement;
                        if (!target.matches("button")) return;
                        const buttons = Array.from(resultsRef.current?.querySelectorAll<HTMLButtonElement>("button") || []);
                        const index = buttons.indexOf(target as HTMLButtonElement);
                        const nextIndex = Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
                        if (nextIndex !== index) {
                            event.preventDefault();
                            buttons[nextIndex]?.focus();
                        }
                    }}
                >
                    <PatientTable
                        patients={patients}
                        loading={loading}
                        onSelect={onSelect}
                        compact
                        highlightedPatientId={searchMode === "PATIENT" && highlightedPatientIndex >= 0 ? patients[highlightedPatientIndex]?.patient_id : undefined}
                    />
                </div>
            )}
        </div>
    );
}

function PatientSearch({
    patients,
    loading,
    search,
    selectedPatientId,
    onSearchChange,
    onSearch,
    onSelect,
    onClearSelected,
    onEdit,
    fullHeight = false,
    compact = false,
    selectable = true,
}: {
    patients: Patient[];
    loading: boolean;
    search: string;
    selectedPatientId: string;
    onSearchChange: (value: string) => void;
    onSearch: () => void;
    onSelect: (patient: Patient) => void;
    onClearSelected: () => void;
    onEdit?: (patient: Patient) => void;
    fullHeight?: boolean;
    compact?: boolean;
    selectable?: boolean;
}) {
    const showResults = fullHeight || selectedPatientId || search.trim().length > 0;

    return (
        <div className="rounded-lg border border-black bg-white">
            <div className="grid gap-3 border-b border-black p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black" />
                    <input
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                onSearch();
                            }
                        }}
                        className="w-full rounded-lg border border-black py-2 pl-9 pr-9 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                        placeholder="Search UHID, name, phone"
                    />
                    {search && (
                        <button type="button" onClick={() => onSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-black hover:bg-black hover:text-white" aria-label="Clear search">
                            <XCircle size={14} />
                        </button>
                    )}
                </div>
                <button type="button" onClick={onSearch} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-black px-3 py-2 text-sm font-medium text-black hover:bg-black hover:text-white disabled:opacity-50">
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    Search
                </button>
            </div>
            {selectedPatientId && (
                <div className="border-b border-black bg-white px-4 py-2 text-xs text-black">
                    Existing patient selected.
                    <button type="button" onClick={onClearSelected} className="ml-2 font-semibold text-black underline">Clear selection</button>
                </div>
            )}
            {showResults && <PatientTable patients={patients} loading={loading} onSelect={onSelect} onEdit={onEdit} fullHeight={fullHeight} compact={compact} selectable={selectable} />}
        </div>
    );
}

function PatientTable({ patients, loading, onSelect, onEdit, fullHeight = false, compact = false, selectable = true, highlightedPatientId }: { patients: Patient[]; loading: boolean; onSelect: (patient: Patient) => void; onEdit?: (patient: Patient) => void; fullHeight?: boolean; compact?: boolean; selectable?: boolean; highlightedPatientId?: number }) {
    if (loading) {
        return <div className="flex min-h-32 items-center gap-2 px-4 py-5 text-sm text-black"><Loader2 size={16} className="animate-spin" />Loading patients</div>;
    }

    if (patients.length === 0) {
        return <div className="min-h-32 px-4 py-5 text-sm text-black">No patients found in this hospital.</div>;
    }

    return (
        <div className={`${fullHeight ? "max-h-[70vh]" : compact ? "max-h-[160px]" : "max-h-[260px]"} overflow-auto`}>
            <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-black">
                    <tr>
                        <th className="px-4 py-3 font-semibold">UHID</th>
                        <th className="px-4 py-3 font-semibold">Patient</th>
                        <th className="px-4 py-3 font-semibold">Phone</th>
                        <th className="px-4 py-3 font-semibold">Last OPD</th>
                        <th className="px-4 py-3 font-semibold">Room</th>
                        <th className="px-4 py-3 font-semibold">City</th>
                        {(selectable || onEdit) && <th className="px-4 py-3 font-semibold">Action</th>}
                    </tr>
                </thead>
                <tbody>
                    {patients.map((patient) => (
                        <tr
                            key={patient.patient_id}
                            data-patient-id={patient.patient_id}
                            className={`border-t border-black ${highlightedPatientId === patient.patient_id ? "bg-gray-200 text-black [&>td]:!text-black" : ""}`}
                            aria-selected={highlightedPatientId === patient.patient_id}
                        >
                            <td className="px-4 py-2 font-semibold text-black">{patient.uhid || "-"}</td>
                            <td className="px-4 py-2 text-black">{patientLabel(patient)}</td>
                            <td className="px-4 py-2 text-black">{patient.phone || "-"}</td>
                            <td className="px-4 py-2 text-black">
                                <p className="font-semibold">{patient.last_visit_number || "-"}</p>
                                <p className="text-xs text-black">{patient.last_visit_date || "-"}</p>
                            </td>
                            <td className="px-4 py-2 text-black">{patient.last_doctor_room_no || "-"}</td>
                            <td className="px-4 py-2 text-black">{patient.city || "-"}</td>
                            {(selectable || onEdit) && (
                                <td className="px-4 py-2">
                                    <div className="flex items-center gap-2">
                                        {selectable && (
                                            <button type="button" onClick={() => onSelect(patient)} className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">Select</button>
                                        )}
                                        {onEdit && (
                                            <button type="button" onClick={() => onEdit(patient)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black text-black hover:bg-black hover:text-white" aria-label="Edit patient">
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function VisitsTable({ visits, loading, actingVisitId, onCancel, onEdit, compact = false }: { visits: Visit[]; loading: boolean; actingVisitId: number | null; onCancel: (visit: Visit) => void; onEdit: (visit: Visit) => void; compact?: boolean }) {
    const showTable = visits.length > 0;
    return (
        <div className="rounded-lg border border-black bg-white">
            <div className="flex items-center justify-between border-b border-black px-4 py-3">
                <h2 className="text-sm font-semibold text-black">{compact ? "Recent OPD Visits" : "Today's OPD Visits"}</h2>
                {loading && showTable && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-black">
                        <Loader2 size={13} className="animate-spin" />
                        Refreshing
                    </span>
                )}
            </div>
            {loading && !showTable ? (
                <div className="flex min-h-40 items-center gap-2 px-4 py-5 text-sm text-black"><Loader2 size={16} className="animate-spin" />Loading visits</div>
            ) : visits.length === 0 ? (
                <div className="min-h-40 px-4 py-5 text-sm text-black">No visits found.</div>
            ) : (
                <div className={`${compact ? "max-h-[360px]" : "max-h-[70vh]"} overflow-auto`}>
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 z-10 border-b border-black bg-white text-xs uppercase tracking-wide text-black">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">TKN</th>
                                    <th className="px-4 py-3 font-semibold">OPD</th>
                                    <th className="px-4 py-3 font-semibold">Type</th>
                                    {compact && <th className="px-4 py-3 font-semibold">Date</th>}
                                    <th className="px-4 py-3 font-semibold">Patient</th>
                                    <th className="px-4 py-3 font-semibold">Room</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                    <th className="px-4 py-3 font-semibold">Payment</th>
                                <th className="px-4 py-3 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visits.map((visit) => (
                                <tr key={visit.visit_id} className="border-t border-black">
                                    <td className="px-4 py-2 font-semibold text-black">{visit.daily_token_number ?? "-"}</td>
                                    <td className="px-4 py-2 font-semibold text-black">{visit.visit_number || visit.visit_id}</td>
                                    <td className="px-4 py-2 text-black">{statusLabel(visit.visit_type)}</td>
                                    {compact && <td className="px-4 py-2 text-black">{visit.visit_date}</td>}
                                    <td className="px-4 py-2 text-black">
                                        <span className="font-semibold">{patientLabel(visit.patient)}</span>
                                        <span className="ml-2 text-black">{visit.patient.uhid || "-"}</span>
                                    </td>
                                    <td className="px-4 py-2 text-black">{visit.doctor.room_no || "-"}</td>
                                    <td className="px-4 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(visit.status)}`}>{visit.status}</span></td>
                                    <td className="px-4 py-2 text-black">{formatCurrency(visit.fee_charged)} / {visit.payment_status}</td>
                                    <td className="px-4 py-2">
                                        <div className="flex flex-wrap gap-2">
                                            <a href={`/hms/staff/visits/${visit.visit_id}/print?printType=HEADER`} target={opdSlipWindowName(visit)} rel="noopener,noreferrer" className="rounded-lg bg-black px-2 py-1 text-xs font-semibold text-white hover:bg-black">Print</a>
                                            {visit.status === "WAITING" && (
                                                <>
                                                    <button type="button" onClick={() => onEdit(visit)} disabled={actingVisitId === visit.visit_id} className="inline-flex items-center gap-1 rounded-lg border border-black px-2 py-1 text-xs font-semibold text-black hover:bg-black hover:text-white disabled:opacity-50" aria-label="Edit waiting visit">
                                                        <Pencil size={13} /> Edit
                                                    </button>
                                                    <button type="button" onClick={() => onCancel(visit)} disabled={actingVisitId === visit.visit_id} className="rounded-lg border border-red-600 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Cancel</button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function DoctorQueues({ queues }: { queues: DoctorQueue[] }) {
    return (
        <div className="rounded-lg border border-black bg-white">
            <div className="border-b border-black px-4 py-3">
                <h2 className="text-sm font-semibold text-black">Doctor Counters</h2>
            </div>
            <div className="divide-y divide-black">
                {queues.length === 0 ? (
                    <div className="px-4 py-5 text-sm text-black">No doctors linked.</div>
                ) : queues.map((queue) => (
                    <div key={queue.doctor_id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-black">
                                    {queue.room_no ? `Room ${queue.room_no} / ` : ""}
                                    {queue.doctor_name ? `Dr. ${queue.doctor_name}` : "Doctor"}
                                </p>
                                <p className="text-xs text-black">Capacity {queue.daily_capacity ?? "-"}</p>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                <Counter label="Total" value={queue.total_visits} />
                                <Counter label="Waiting" value={queue.waiting_visits} />
                                <Counter label="Active" value={queue.active_visits} />
                                <Counter label="Paid" value={queue.paid_visits} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Counter({ label, value }: { label: string; value: number }) {
    return (
        <div className="min-w-16 rounded-lg border border-black bg-white px-2 py-1">
            <p className="font-semibold text-black">{value}</p>
            <p className="text-black">{label}</p>
        </div>
    );
}
