import prisma from "@/lib/prisma";
import type { HmsSession } from "@/lib/hms-auth";

export type HmsPrintType = "HEADER" | "INVESTIGATION_REQUEST" | "CONSULTATION" | "REGISTRATION_SLIP" | "PRESCRIPTION";

type RawDb = {
    $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
    $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

type DoctorRow = {
    doctor_id: number;
};

type VisitScopeRow = {
    visit_id: number;
    hospital_id: number;
    hospital_group_code: string;
    admin_id: number;
    patient_id: number;
    doctor_id: number;
    visit_date: Date | string;
    visit_type: string;
    visit_number: string | null;
    daily_token_number: number | null;
    status: string;
    fee_charged: string | number | null;
    patient_name: string | null;
    patient_uhid: string | null;
    patient_phone: string | null;
    age: number | null;
    gender: string | null;
    doctor_name: string | null;
    referred_by_doctor_id: number | null;
    referred_by_doctor_name: string | null;
    room_no: string | null;
    hospital_name: string;
};

type PrescriptionScopeRow = {
    id: number;
    status: string;
    finalized_at: Date | string | null;
};

type PrescriptionTestRow = {
    test_name: string;
    notes: string | null;
    sort_order: number;
};

type HeaderEventRow = {
    event_id: bigint | number;
};

type CountResultRow = {
    count_value: bigint | number;
};

type OffsetRow = {
    offset_mm: string | number | null;
    pending_count: bigint | number | null;
};

type InsertIdRow = {
    id: bigint | number;
};

type PrintEventRow = {
    event_id: bigint | number;
    print_type: string;
    start_offset_mm: string | number;
    rendered_height_mm: string | number | null;
    created_at: Date | string | null;
};

type PolicyRow = {
    policies: unknown;
};

function toNumber(value: bigint | number | string | null | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function parseJsonObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value !== "string") return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

export async function isHmsDoctorTokenEnabled(hospitalId: number) {
    const rows = await prisma.$queryRawUnsafe<PolicyRow[]>(
        `
        SELECT policies
        FROM hospital_policy_settings
        WHERE hospital_id = ?
        LIMIT 1
        `,
        hospitalId
    );
    return parseJsonObject(rows[0]?.policies).doctor_token_enabled === true;
}

export function normalizeHmsPrintType(value: unknown): HmsPrintType | null {
    const printType = String(value || "").trim().toUpperCase();
    if (printType === "HEADER" || printType === "INVESTIGATION_REQUEST" || printType === "CONSULTATION" || printType === "REGISTRATION_SLIP" || printType === "PRESCRIPTION") {
        return printType;
    }
    return null;
}

async function acquirePrintLock(db: RawDb, visitId: number) {
    const lockName = `hms-print-visit-${visitId}`;
    const rows = await db.$queryRawUnsafe<Array<{ lock_acquired: bigint | number | null }>>(
        "SELECT GET_LOCK(?, 5) AS lock_acquired",
        lockName
    );
    return Number(rows[0]?.lock_acquired || 0) === 1 ? lockName : null;
}

async function releasePrintLock(db: RawDb, lockName: string) {
    await db.$queryRawUnsafe("SELECT RELEASE_LOCK(?)", lockName);
}

async function resolveDoctorIdForSession(session: HmsSession) {
    if (session.hospitalContext.role !== "DOCTOR") return null;

    const rows = await prisma.$queryRawUnsafe<DoctorRow[]>(
        `
        SELECT doctor_id
        FROM doctors
        WHERE user_id = ?
          AND admin_id = ?
        LIMIT 1
        `,
        session.hospitalContext.userId,
        session.hospitalContext.adminId
    );

    return rows[0]?.doctor_id ? Number(rows[0].doctor_id) : null;
}

export async function getScopedHmsVisit(input: {
    db?: RawDb;
    session: HmsSession;
    visitId: number;
}) {
    const db = input.db || prisma;
    const hospital = input.session.hospitalContext;
    const doctorId = await resolveDoctorIdForSession(input.session);
    const doctorFilter = hospital.role === "DOCTOR" ? "AND v.doctor_id = ?" : "";
    const doctorValues = hospital.role === "DOCTOR" ? [doctorId || -1] : [];

    const rows = await db.$queryRawUnsafe<VisitScopeRow[]>(
        `
        SELECT
            v.visit_id,
            v.hospital_id,
            v.hospital_group_code,
            v.admin_id,
            v.patient_id,
            v.doctor_id,
            v.visit_date,
            v.visit_type,
            v.visit_number,
            v.daily_token_number,
            v.status,
            v.fee_charged,
            p.full_name AS patient_name,
            p.uhid AS patient_uhid,
            p.phone AS patient_phone,
            p.age,
            p.gender,
            d.doctor_name,
            v.referred_by_doctor_id,
            rd.doctor_name AS referred_by_doctor_name,
            hd.room_no,
            h.name AS hospital_name
        FROM visits v
        INNER JOIN hospitals h
          ON h.hospital_id = v.hospital_id
        INNER JOIN patients p
          ON p.patient_id = v.patient_id
         AND p.admin_id = ?
         AND p.hospital_group_code = ?
        INNER JOIN doctors d
          ON d.doctor_id = v.doctor_id
         AND d.admin_id = ?
        LEFT JOIN doctors rd
          ON rd.doctor_id = v.referred_by_doctor_id
         AND rd.admin_id = ?
        INNER JOIN hospital_doctors hd
          ON hd.hospital_id = v.hospital_id
         AND hd.doctor_id = v.doctor_id
        WHERE v.visit_id = ?
          AND v.hospital_id = ?
          AND v.admin_id = ?
          AND v.hospital_group_code = ?
          ${doctorFilter}
        LIMIT 1
        `,
        hospital.adminId,
        hospital.hospitalCode,
        hospital.adminId,
        hospital.adminId,
        input.visitId,
        hospital.hospitalId,
        hospital.adminId,
        hospital.hospitalCode,
        ...doctorValues
    );

    return rows[0] || null;
}

async function getScopedPrescription(input: {
    db: RawDb;
    prescriptionId: number | null;
    visit: VisitScopeRow;
}) {
    if (!input.prescriptionId) return null;

    const rows = await input.db.$queryRawUnsafe<PrescriptionScopeRow[]>(
        `
        SELECT id, status, finalized_at
        FROM prescriptions
        WHERE id = ?
          AND doctor_id = ?
          AND patient_id = ?
          AND is_deleted = 0
        LIMIT 1
        `,
        input.prescriptionId,
        input.visit.doctor_id,
        input.visit.patient_id
    );

    return rows[0] || null;
}

async function resolveStartOffsetMm(input: {
    db: RawDb;
    visitId: number;
    printType: HmsPrintType;
    resetSheet?: boolean;
    includeInvestigationPasses?: boolean;
    requireInvestigationRequest?: boolean;
}) {
    if (input.printType === "HEADER") return 0;
    if (input.resetSheet) return 0;

    const headerRows = await input.db.$queryRawUnsafe<HeaderEventRow[]>(
        `
        SELECT event_id
        FROM visit_print_events
        WHERE visit_id = ?
          AND print_type = 'HEADER'
        ORDER BY event_id DESC
        LIMIT 1
        `,
        input.visitId
    );

    const headerEventId = headerRows[0]?.event_id;
    if (!headerEventId) return 0;

    if (input.requireInvestigationRequest) {
        const investigationRows = await input.db.$queryRawUnsafe<CountResultRow[]>(
            `
            SELECT COUNT(*) AS count_value
            FROM visit_print_events
            WHERE visit_id = ?
              AND event_id >= ?
              AND print_type = 'INVESTIGATION_REQUEST'
              AND rendered_height_mm > 0
            `,
            input.visitId,
            headerEventId
        );

        if (toNumber(investigationRows[0]?.count_value) === 0) {
            throw new Error("Investigation print height was not found for this sheet. Retry the investigation print or continue with Header only.");
        }
    }

    const includeInvestigationPasses = input.printType === "CONSULTATION" || input.printType === "PRESCRIPTION"
        ? input.includeInvestigationPasses === true
        : input.printType === "INVESTIGATION_REQUEST"
            ? false
            : input.includeInvestigationPasses !== false;
    const offsetRows = await input.db.$queryRawUnsafe<OffsetRow[]>(
        `
        SELECT
          COALESCE(SUM(rendered_height_mm), 0) AS offset_mm,
          SUM(CASE WHEN rendered_height_mm IS NULL THEN 1 ELSE 0 END) AS pending_count
        FROM visit_print_events
        WHERE visit_id = ?
          AND event_id >= ?
          AND (
            print_type = 'HEADER'
            OR (? = 1 AND print_type = 'INVESTIGATION_REQUEST')
          )
        `,
        input.visitId,
        headerEventId,
        includeInvestigationPasses ? 1 : 0
    );

    if (toNumber(offsetRows[0]?.pending_count) > 0) {
        throw new Error("A previous print pass has not recorded its height. Mark it failed or retry before printing the next pass.");
    }

    return toNumber(offsetRows[0]?.offset_mm);
}

async function getPrescriptionTests(input: {
    db: RawDb;
    prescriptionId: number | null;
}) {
    if (!input.prescriptionId) return [];

    return input.db.$queryRawUnsafe<PrescriptionTestRow[]>(
        `
        SELECT test_name, notes, sort_order
        FROM prescription_tests
        WHERE prescription_id = ?
        ORDER BY sort_order ASC, id ASC
        `,
        input.prescriptionId
    );
}

export async function createHmsVisitPrintEvent(input: {
    session: HmsSession;
    visitId: number;
    printType: HmsPrintType;
    prescriptionId?: number | null;
    resetSheet?: boolean;
    includeInvestigationPasses?: boolean;
    requireInvestigationRequest?: boolean;
}) {
    return prisma.$transaction(async (tx) => {
        const lockName = await acquirePrintLock(tx, input.visitId);
        if (!lockName) {
            throw new Error("Another print pass is being prepared for this visit. Please try again.");
        }

        try {
        const visit = await getScopedHmsVisit({
            db: tx,
            session: input.session,
            visitId: input.visitId,
        });

        if (!visit) {
            throw new Error("Visit was not found for this hospital.");
        }

        const prescription = await getScopedPrescription({
            db: tx,
            prescriptionId: input.prescriptionId || null,
            visit,
        });

        if (input.prescriptionId && !prescription) {
            throw new Error("Prescription was not found for this visit.");
        }

        if (input.printType === "INVESTIGATION_REQUEST" && !prescription) {
            throw new Error("Investigation request print needs an active prescription draft.");
        }

        if (input.resetSheet && input.printType !== "HEADER") {
            await tx.$executeRawUnsafe(
                `
                INSERT INTO visit_print_events (
                    visit_id,
                    prescription_id,
                    print_type,
                    start_offset_mm,
                    rendered_height_mm,
                    created_by_user_id
                )
                VALUES (?, NULL, 'HEADER', 0, 0, ?)
                `,
                input.visitId,
                input.session.hospitalContext.userId
            );
        }

        const startOffsetMm = await resolveStartOffsetMm({
            db: tx,
            visitId: input.visitId,
            printType: input.printType,
            resetSheet: input.resetSheet,
            includeInvestigationPasses: input.includeInvestigationPasses,
            requireInvestigationRequest: input.requireInvestigationRequest,
        });

        await tx.$executeRawUnsafe(
            `
            INSERT INTO visit_print_events (
                visit_id,
                prescription_id,
                print_type,
                start_offset_mm,
                rendered_height_mm,
                created_by_user_id
            )
            VALUES (?, ?, ?, ?, NULL, ?)
            `,
            input.visitId,
            prescription?.id || null,
            input.printType,
            startOffsetMm,
            input.session.hospitalContext.userId
        );

        const idRows = await tx.$queryRawUnsafe<InsertIdRow[]>("SELECT LAST_INSERT_ID() AS id");
        const eventId = toNumber(idRows[0]?.id);
        if (!eventId) {
            throw new Error("Print event was not created.");
        }

        return {
            event: {
                event_id: eventId,
                visit_id: input.visitId,
                prescription_id: prescription?.id || null,
                print_type: input.printType,
                start_offset_mm: startOffsetMm,
            },
            visit,
            prescription: prescription ? {
                ...prescription,
                tests: await getPrescriptionTests({
                    db: tx,
                    prescriptionId: prescription.id,
                }),
            } : null,
        };
        } finally {
            await releasePrintLock(tx, lockName);
        }
    });
}

export async function hasSuccessfulInvestigationRequestOnCurrentSheet(input: {
    session: HmsSession;
    visitId: number;
}) {
    const visit = await getScopedHmsVisit({
        session: input.session,
        visitId: input.visitId,
    });

    if (!visit) return false;

    const headerRows = await prisma.$queryRawUnsafe<HeaderEventRow[]>(
        `
        SELECT event_id
        FROM visit_print_events
        WHERE visit_id = ?
          AND print_type = 'HEADER'
        ORDER BY event_id DESC
        LIMIT 1
        `,
        input.visitId
    );

    const headerEventId = headerRows[0]?.event_id;
    if (!headerEventId) return false;

    const rows = await prisma.$queryRawUnsafe<CountResultRow[]>(
        `
        SELECT COUNT(*) AS count_value
        FROM visit_print_events
        WHERE visit_id = ?
          AND event_id >= ?
          AND print_type = 'INVESTIGATION_REQUEST'
          AND rendered_height_mm > 0
        `,
        input.visitId,
        headerEventId
    );

    return toNumber(rows[0]?.count_value) > 0;
}

export async function updateHmsPrintEventHeight(input: {
    session: HmsSession;
    eventId: number;
    renderedHeightMm: number;
}) {
    const hospital = input.session.hospitalContext;
    const doctorId = await resolveDoctorIdForSession(input.session);
    const doctorFilter = hospital.role === "DOCTOR" ? "AND v.doctor_id = ?" : "";
    const doctorValues = hospital.role === "DOCTOR" ? [doctorId || -1] : [];

    const rows = await prisma.$queryRawUnsafe<PrintEventRow[]>(
        `
        SELECT
            vpe.event_id,
            vpe.print_type,
            vpe.start_offset_mm,
            vpe.rendered_height_mm,
            vpe.created_at
        FROM visit_print_events vpe
        INNER JOIN visits v
          ON v.visit_id = vpe.visit_id
        WHERE vpe.event_id = ?
          AND v.hospital_id = ?
          AND v.admin_id = ?
          AND v.hospital_group_code = ?
          ${doctorFilter}
        LIMIT 1
        `,
        input.eventId,
        hospital.hospitalId,
        hospital.adminId,
        hospital.hospitalCode,
        ...doctorValues
    );

    if (!rows[0]) {
        return null;
    }

    await prisma.$executeRawUnsafe(
        `
        UPDATE visit_print_events
        SET rendered_height_mm = ?
        WHERE event_id = ?
        `,
        input.renderedHeightMm,
        input.eventId
    );

    return {
        event_id: input.eventId,
        rendered_height_mm: input.renderedHeightMm,
    };
}
