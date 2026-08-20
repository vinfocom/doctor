import { notFound, redirect } from "next/navigation";
import HmsSharedPaperPrintView from "@/components/hms/HmsSharedPaperPrintView";
import { getHmsSession } from "@/lib/hms-auth";
import { getHmsEmrLayoutSettings } from "@/lib/hms-emr-layout-settings";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { createHmsVisitPrintEvent, hasSuccessfulInvestigationRequestOnCurrentSheet, isHmsDoctorTokenEnabled, normalizeHmsPrintType } from "@/lib/hms-print-events";
import { resolveHmsPrintLayoutForDoctor } from "@/lib/hms-print-layout-service";
import { getHmsPrintablePrescriptionData } from "@/lib/hms-printable-prescription";

type PageProps = {
    params: Promise<{
        visitId: string;
    }>;
    searchParams?: Promise<{
        printType?: string;
        prescriptionId?: string;
        resetSheet?: string;
        includeInvestigation?: string;
    }>;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function serializeDate(value: Date | string | null | undefined) {
    if (!value) return null;
    return typeof value === "string" ? value : value.toISOString();
}

export default async function HmsDoctorVisitPrintPage({ params, searchParams }: PageProps) {
    const session = await getHmsSession();
    if (!session || session.hospitalContext.role !== "DOCTOR") {
        redirect("/hms");
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "shared_paper_print_mode"))) {
        redirect("/hms/doctor");
    }

    const { visitId: visitIdParam } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const visitId = normalizeId(visitIdParam);
    const printType = normalizeHmsPrintType(resolvedSearchParams.printType || "CONSULTATION");
    const prescriptionId = normalizeId(resolvedSearchParams.prescriptionId);
    const resetSheet = resolvedSearchParams.resetSheet === "1";
    const includeInvestigationPasses = resolvedSearchParams.includeInvestigation === "1";

    if (!visitId || !printType) {
        notFound();
    }

    let context: Awaited<ReturnType<typeof createHmsVisitPrintEvent>>;

    try {
        context = await createHmsVisitPrintEvent({
            session,
            visitId,
            printType,
            prescriptionId,
            resetSheet,
            includeInvestigationPasses,
            requireInvestigationRequest: !resetSheet && includeInvestigationPasses && (printType === "CONSULTATION" || printType === "PRESCRIPTION"),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to prepare this print.";
        return (
            <div className="min-h-screen bg-white px-6 py-8 text-black">
                <div className="mx-auto max-w-xl rounded-lg border border-black bg-white p-5">
                    <h1 className="text-lg font-bold text-black">Print cannot continue</h1>
                    <p className="mt-2 text-sm text-black">{message}</p>
                    <a href={`/hms/doctor/visits/${visitId}`} className="mt-5 inline-flex rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white">
                        Back to EMR
                    </a>
                </div>
            </div>
        );
    }

    const printablePrescription =
        context.prescription?.id && (printType === "CONSULTATION" || printType === "PRESCRIPTION")
            ? await getHmsPrintablePrescriptionData({
                hospitalId: session.hospitalContext.hospitalId,
                adminId: session.hospitalContext.adminId,
                hospitalCode: session.hospitalContext.hospitalCode,
                doctorId: context.visit.doctor_id,
                prescriptionId: context.prescription.id,
            })
            : null;

    if ((printType === "CONSULTATION" || printType === "PRESCRIPTION") && !printablePrescription) {
        notFound();
    }

    const omitAlreadyPrintedTests =
        (printType === "CONSULTATION" || printType === "PRESCRIPTION") &&
        includeInvestigationPasses &&
        await hasSuccessfulInvestigationRequestOnCurrentSheet({
            session,
            visitId,
        });

    const resolvedLayout = await resolveHmsPrintLayoutForDoctor({
        hospitalId: session.hospitalContext.hospitalId,
        doctorId: context.visit.doctor_id,
    });
    const { settings: resolvedEmrLayoutSettings } = await getHmsEmrLayoutSettings({
        hospitalId: session.hospitalContext.hospitalId,
        doctorId: context.visit.doctor_id,
    });
    const showDoctorToken = await isHmsDoctorTokenEnabled(session.hospitalContext.hospitalId);

    return (
        <HmsSharedPaperPrintView
            event={{
                event_id: context.event.event_id,
                print_type: context.event.print_type,
                start_offset_mm: context.event.start_offset_mm,
            }}
            visit={{
                visit_id: context.visit.visit_id,
                visit_number: context.visit.visit_number,
                daily_token_number: context.visit.daily_token_number,
                visit_date: serializeDate(context.visit.visit_date) || "",
                visit_type: context.visit.visit_type,
                status: context.visit.status,
                fee_charged: context.visit.fee_charged,
                patient_name: context.visit.patient_name,
                patient_uhid: context.visit.patient_uhid,
                patient_phone: context.visit.patient_phone,
                age: context.visit.age,
                gender: context.visit.gender,
                doctor_name: context.visit.doctor_name,
                referred_by_doctor_name: context.visit.referred_by_doctor_name,
                room_no: context.visit.room_no,
                hospital_name: context.visit.hospital_name,
                hospital_group_code: context.visit.hospital_group_code,
            }}
            prescription={context.prescription
                ? {
                    id: context.prescription.id,
                    status: context.prescription.status,
                    finalized_at: serializeDate(context.prescription.finalized_at),
                    tests: context.prescription.tests,
                }
                : null}
            printablePrescription={printablePrescription}
            omitTests={omitAlreadyPrintedTests}
            pageMargins={resolvedEmrLayoutSettings.page_margin_json}
            headerConfig={resolvedLayout?.header_config_json || null}
            showDoctorToken={showDoctorToken}
            backHref="/hms/doctor"
        />
    );
}
