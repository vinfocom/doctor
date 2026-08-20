import { notFound, redirect } from "next/navigation";
import HmsSharedPaperPrintView from "@/components/hms/HmsSharedPaperPrintView";
import { getHmsSession, getHmsStaffProfile } from "@/lib/hms-auth";
import { getHmsEmrLayoutSettings } from "@/lib/hms-emr-layout-settings";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { createHmsVisitPrintEvent, isHmsDoctorTokenEnabled, normalizeHmsPrintType } from "@/lib/hms-print-events";
import { resolveHmsPrintLayoutForDoctor } from "@/lib/hms-print-layout-service";

type PageProps = {
    params: Promise<{
        visitId: string;
    }>;
    searchParams?: Promise<{
        printType?: string;
        prescriptionId?: string;
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

export default async function HmsStaffVisitPrintPage({ params, searchParams }: PageProps) {
    const session = await getHmsSession();
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        redirect("/hms");
    }

    const staff = await getHmsStaffProfile(session.hospitalContext);
    if (staff?.staffType !== "REGISTRATION") {
        redirect("/hms");
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "shared_paper_print_mode"))) {
        redirect("/hms/staff");
    }

    const { visitId: visitIdParam } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const visitId = normalizeId(visitIdParam);
    const printType = normalizeHmsPrintType(resolvedSearchParams.printType || "HEADER");
    const prescriptionId = normalizeId(resolvedSearchParams.prescriptionId);

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
        });
    } catch {
        notFound();
    }

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
            pageMargins={resolvedEmrLayoutSettings.page_margin_json}
            headerConfig={resolvedLayout?.header_config_json || null}
            showDoctorToken={showDoctorToken}
            backHref="/hms/staff"
            documentTitlePrefix="OPD Slip"
        />
    );
}
