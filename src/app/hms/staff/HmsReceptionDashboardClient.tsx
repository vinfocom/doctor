"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Printer, RefreshCw, Search, UserRound, XCircle } from "lucide-react";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

type StaffViewMode = "registration" | "patients" | "visits";

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
    feePolicy?: {
        registrationFee: number;
        consultationFee: number;
        feeWaiverAllowed?: boolean;
        feeWaiverReasonRequired?: boolean;
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
        override_reason: "",
    });
    const [feeManuallyEdited, setFeeManuallyEdited] = useState(false);
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
    const [actingVisitId, setActingVisitId] = useState<number | null>(null);
    const [cancelVisit, setCancelVisit] = useState<Visit | null>(null);
    const [createdVisit, setCreatedVisit] = useState<Visit | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const clearError = useCallback(() => setError(""), []);
    const clearSuccess = useCallback(() => setSuccess(""), []);
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
    }, [mode, patientDate, patientPage, patientSearch, requiresExistingPatient, selectedTempToken, showTempTokenPanel]);

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
            if (tokenName && !patientSearch.trim()) {
                setPatientSearch(tokenName);
            }
            return;
        }

        if (tokenName && patientSearch.trim() === tokenName) {
            setPatientSearch("");
        }
    }, [patientSearch, requiresExistingPatient, selectedTempToken, showTempTokenPanel]);

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
                    }));
                } else {
                    setVisitForm((prev) => prev.payment_mode === "FREE"
                        ? { ...prev, payment_mode: "CASH", payment_status: "PAID", fee_waived_reason: "" }
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
        const projectedCount = selectedDoctor ? countedDoctorVisits(selectedDoctor) + 1 : 0;
        const surcharge = selectedDoctor && threshold && visitsData.feePolicy.surchargeEnabled && projectedCount > threshold
            ? visitsData.feePolicy.surchargeAmount
            : 0;
        return baseFee + surcharge;
    }, [selectedDoctor, visitForm.payment_mode, visitForm.visit_type, visitsData?.feePolicy]);
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
        const nextValue = field === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value;
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

    const resetRegistrationForm = () => {
        setPatientSearch("");
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
            fee_charged: "",
            fee_waived_reason: "",
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
        setError("");
        setSuccess("");
    };

    const selectPatient = (patient: Patient) => {
        if (selectedPatient && selectedPatient.patient_id !== patient.patient_id) {
            const confirmed = window.confirm("Replace the currently selected patient with this patient?");
            if (!confirmed) return;
        }

        setSelectedPatient(patient);
        setVisitForm((prev) => ({ ...prev, patient_id: String(patient.patient_id), override_reason: "" }));
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

    const validatePatientIfNeeded = () => {
        const nextErrors: Partial<Record<keyof PatientForm, string>> = {};
        if (selectedPatient) return nextErrors;
        if (requiresExistingPatient && !showOverride) return nextErrors;

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

    const updateSelectedPatientContact = async (patient: Patient) => {
        const response = await fetch("/api/hms/staff/patients", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                patient_id: patient.patient_id,
                full_name: patient.full_name || patientForm.full_name.trim(),
                age: patient.age ?? Number(patientForm.age),
                gender: patient.gender || patientForm.gender,
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
            const patient = selectedPatient
                ? await updateSelectedPatientContact(selectedPatient)
                : canCreateNewPatient
                    ? await createPatientRecord()
                    : null;
            if (!patient) throw new Error("Select an existing patient for this OPD type.");

            const visit = await createVisitRecord(patient.patient_id);
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
            setCreatedVisit(visitWithDetails);
            setSuccess(`OPD ${visitWithDetails.visit_number || visitWithDetails.visit_id} saved. Fee ${formatCurrency(visitWithDetails.fee_charged)}.`);
            if (!visitForm.patient_id) {
                setPatients((prev) => [patient, ...prev]);
            }
            setPatientForm(emptyPatientForm);
            setSelectedPatient(null);
            setSelectedTempToken(null);
            setExactUhid("");
            setShowOverride(false);
            setDuplicateWarningDismissed(false);
            setVisitForm((prev) => ({
                ...prev,
                patient_id: "",
                referred_by_doctor_id: "",
                referring_prescription_id: "",
                fee_waived_reason: "",
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
                <form onSubmit={saveRegistration} className="rounded-lg border border-black bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-black px-4 py-3">
                        <h2 className="text-sm font-semibold text-black">OPD Registration</h2>
                        <button
                            type="button"
                            onClick={resetRegistrationForm}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black text-black hover:bg-black hover:text-white"
                            title="Reset form"
                            aria-label="Reset registration form"
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

                            {likelyDuplicateWarning && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                    Similar patients are listed above. Select the existing patient if this is not a new UHID.
                                    <button type="button" onClick={() => setDuplicateWarningDismissed(true)} className="ml-2 font-semibold underline">
                                        Dismiss
                                    </button>
                                </div>
                            )}

                            <div>
                                <div className="mb-3 flex items-center gap-2">
                                    <UserRound size={17} />
                                    <h3 className="text-sm font-semibold text-black">
                                        {selectedPatient ? "Selected Patient" : canCreateNewPatient ? "New Patient Details" : "Patient Selection Required"}
                                    </h3>
                                </div>
                                {selectedPatient ? (
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
                                ) : canCreateNewPatient ? (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {showOverride && (
                                            <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                                Exact UHID was not found in this hospital. Create a new UHID only if the patient cannot be matched.
                                            </div>
                                        )}
                                        <Field label="Name" value={patientForm.full_name} error={patientErrors.full_name} onChange={(value) => updatePatientForm("full_name", value)} required />
                                        <Field label="Mobile No." value={patientForm.phone} error={patientErrors.phone} onChange={(value) => updatePatientForm("phone", value)} />
                                        <Field
                                            label="Age"
                                            value={patientForm.age}
                                            error={patientErrors.age}
                                            onChange={(value) => updatePatientForm("age", value)}
                                            required
                                        />
                                        <Select label="Sex" value={patientForm.gender} error={patientErrors.gender} onChange={(value) => updatePatientForm("gender", value)} options={["MALE", "FEMALE", "OTHER"]} required />
                                        <Field label="City" value={patientForm.city} error={patientErrors.city} onChange={(value) => updatePatientForm("city", value)} />
                                        <Field label="Location" value={patientForm.location} error={patientErrors.location} onChange={(value) => updatePatientForm("location", value)} />
                                        <div className="md:col-span-2">
                                            <Field label="Address" value={patientForm.address} error={patientErrors.address} onChange={(value) => updatePatientForm("address", value)} />
                                        </div>
                                        {showOverride && (
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
                                        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                                            <Field label="Exact UHID Lookup" value={exactUhid} error={visitErrors.patient_id} onChange={setExactUhid} clearable onClear={() => setExactUhid("")} onEnter={() => void lookupExactUhid()} />
                                            <button type="button" onClick={() => void lookupExactUhid()} disabled={loadingPatients} className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
                                                {loadingPatients && <Loader2 size={15} className="animate-spin" />}
                                                Lookup UHID
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-black p-4 lg:border-l lg:border-t-0">
                            <h3 className="mb-3 text-sm font-semibold text-black">OPD Details</h3>
                            <div className="grid gap-3">
                                <Select
                                    label="OPD Type"
                                    value={visitForm.visit_type}
                                    error={visitErrors.visit_type}
                                    onChange={(value) => {
                                        updateVisitForm("visit_type", value);
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
                                    <Field label="Waiver Reason" value={visitForm.fee_waived_reason} error={visitErrors.fee_waived_reason} onChange={(value) => updateVisitForm("fee_waived_reason", value)} required={feeWaiverReasonRequired} />
                                )}
                            </div>

                            <button type="submit" disabled={submittingRegistration} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
                                {submittingRegistration ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                {selectedPatient ? "Save OPD for selected patient" : "Save OPD Registration"}
                            </button>

                            {createdVisit && (
                                <a href={`/hms/staff/visits/${createdVisit.visit_id}/print?printType=HEADER`} target={opdSlipWindowName(createdVisit)} rel="noopener,noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-black px-4 py-2.5 text-sm font-semibold text-black hover:bg-black hover:text-white">
                                    <Printer size={16} />
                                    Print Slip
                                </a>
                            )}
                        </div>
                    </div>
                </form>
                <div className="mt-5">
                    <VisitsTable visits={latestVisitsFirst(visitsData?.visits || []).slice(0, 25)} loading={loadingVisits} actingVisitId={actingVisitId} onCancel={(visit) => setCancelVisit(visit)} compact />
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
                    <VisitsTable visits={visitsData?.visits || []} loading={loadingVisits} actingVisitId={actingVisitId} onCancel={(visit) => setCancelVisit(visit)} />
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
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-black">{label}{required && <span className="text-red-600"> *</span>}</label>
            <div className="relative">
                <input
                    type={type}
                    inputMode={inputMode}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={(event) => {
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

function Select({ label, value, error, onChange, options, required = false, placeholder = "Select" }: { label: string; value: string; error?: string; onChange: (value: string) => void; options: Array<string | { value: string; label: string }>; required?: boolean; placeholder?: string }) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-black">{label}{required && <span className="text-red-600"> *</span>}</label>
            <select value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={focusNextOnEnter} className={`w-full rounded-lg border px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${error ? "border-red-600" : "border-black"}`}>
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

function PatientTable({ patients, loading, onSelect, onEdit, fullHeight = false, compact = false, selectable = true }: { patients: Patient[]; loading: boolean; onSelect: (patient: Patient) => void; onEdit?: (patient: Patient) => void; fullHeight?: boolean; compact?: boolean; selectable?: boolean }) {
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
                        <tr key={patient.patient_id} className="border-t border-black">
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

function VisitsTable({ visits, loading, actingVisitId, onCancel, compact = false }: { visits: Visit[]; loading: boolean; actingVisitId: number | null; onCancel: (visit: Visit) => void; compact?: boolean }) {
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
                                                <button type="button" onClick={() => onCancel(visit)} disabled={actingVisitId === visit.visit_id} className="rounded-lg border border-red-600 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Cancel</button>
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
