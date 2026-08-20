import prisma from "@/lib/prisma";

export type HmsPrintLayoutTargetType = "ALL_DOCTORS" | "SPECIFIC_DOCTOR" | "DOCTOR_GROUP";

type LayoutRow = {
    layout_id: number;
    hospital_id: number;
    layout_name: string;
    description: string | null;
    layout_config_json: unknown;
    header_config_json: unknown;
    is_active: number | boolean;
    created_at: Date | string | null;
    updated_at: Date | string | null;
    target_type: string | null;
    assignment_id: number | null;
};

type DoctorRow = {
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
};

type AssignmentDoctorRow = {
    assignment_id: number;
    doctor_id: number;
};

type SaveInput = {
    hospitalId: number;
    userId: number;
    layoutName: string;
    description?: string | null;
    targetType: HmsPrintLayoutTargetType;
    doctorIds: number[];
    headerConfig: Record<string, unknown>;
    layoutConfig: Record<string, unknown>;
};

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

function toNumberId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function uniqueSortedIds(values: unknown[]) {
    return Array.from(new Set(values.map(toNumberId).filter((id): id is number => Boolean(id)))).sort((left, right) => left - right);
}

function normalizeTargetType(value: unknown): HmsPrintLayoutTargetType | null {
    const target = String(value || "").trim().toUpperCase();
    if (target === "ALL_DOCTORS" || target === "SPECIFIC_DOCTOR" || target === "DOCTOR_GROUP") return target;
    return null;
}

function normalizeLayoutName(value: unknown) {
    return String(value || "").trim();
}

function normalizeOptionalText(value: unknown) {
    const text = String(value || "").trim();
    return text || null;
}

function parsePositiveMm(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 297 ? Math.round(parsed * 100) / 100 : fallback;
}

function parsePositivePx(value: unknown, fallback: number, min = 1, max = 72) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? Math.round(parsed) : fallback;
}

function parsePageMargin(value: unknown) {
    const row = parseJsonObject(value);
    return {
        top_mm: parsePositiveMm(row.top_mm, 10),
        right_mm: parsePositiveMm(row.right_mm, 10),
        bottom_mm: parsePositiveMm(row.bottom_mm, 10),
        left_mm: parsePositiveMm(row.left_mm, 10),
    };
}

export function normalizeHmsPrintLayoutPayload(body: unknown) {
    const input = parseJsonObject(body);
    const targetType = normalizeTargetType(input.target_type);
    const doctorIds = uniqueSortedIds(Array.isArray(input.doctor_ids) ? input.doctor_ids : []);
    const headerConfig = parseJsonObject(input.header_config_json);
    const layoutConfig = parseJsonObject(input.layout_config_json);

    const normalized = {
        layoutName: normalizeLayoutName(input.layout_name),
        description: normalizeOptionalText(input.description),
        targetType,
        doctorIds,
        headerConfig: {
            header_height_mm: parsePositiveMm(headerConfig.header_height_mm, 38),
            show_mobile_no: headerConfig.show_mobile_no !== false,
            show_fee: headerConfig.show_fee !== false,
            show_room_no: headerConfig.show_room_no !== false,
            title_font_size_px: parsePositivePx(headerConfig.title_font_size_px, 16, 12, 28),
            body_font_size_px: parsePositivePx(headerConfig.body_font_size_px, 12, 9, 18),
        },
        layoutConfig: {
            page_margin_json: parsePageMargin(layoutConfig.page_margin_json),
            footer_height_mm: parsePositiveMm(layoutConfig.footer_height_mm, 0),
            font_size_px: parsePositiveMm(layoutConfig.font_size_px, 12),
        },
    };

    const fieldErrors: Record<string, string> = {};
    if (!normalized.layoutName) fieldErrors.layout_name = "Layout name is required.";
    if (!targetType) fieldErrors.target_type = "Choose who this layout applies to.";
    if (targetType === "SPECIFIC_DOCTOR" && doctorIds.length !== 1) {
        fieldErrors.doctor_ids = "Choose exactly one doctor.";
    }
    if (targetType === "DOCTOR_GROUP" && doctorIds.length < 2) {
        fieldErrors.doctor_ids = "Choose at least two doctors for a group.";
    }
    if (targetType === "ALL_DOCTORS" && doctorIds.length > 0) {
        fieldErrors.doctor_ids = "All Doctors layout does not need doctor selection.";
    }

    return { normalized, fieldErrors };
}

async function assertDoctorsBelongToHospital(hospitalId: number, doctorIds: number[]) {
    if (doctorIds.length === 0) return;

    const rows = await prisma.$queryRawUnsafe<Array<{ doctor_id: number }>>(
        `
        SELECT doctor_id
        FROM hospital_doctors
        WHERE hospital_id = ?
          AND doctor_id IN (${doctorIds.map(() => "?").join(",")})
        `,
        hospitalId,
        ...doctorIds
    );
    const found = new Set(rows.map((row) => Number(row.doctor_id)));
    const missing = doctorIds.filter((doctorId) => !found.has(doctorId));
    if (missing.length > 0) {
        throw new Error("One or more selected doctors do not belong to this hospital.");
    }
}

async function assertNoAmbiguousActiveAssignment(input: {
    hospitalId: number;
    targetType: HmsPrintLayoutTargetType;
    doctorIds: number[];
    ignoreAssignmentId?: number | null;
}) {
    if (input.targetType === "ALL_DOCTORS") {
        const rows = await prisma.$queryRawUnsafe<Array<{ assignment_id: number }>>(
            `
            SELECT assignment_id
            FROM hms_print_layout_assignments
            WHERE hospital_id = ?
              AND target_type = 'ALL_DOCTORS'
              AND is_active = 1
              AND (? IS NULL OR assignment_id <> ?)
            LIMIT 1
            `,
            input.hospitalId,
            input.ignoreAssignmentId || null,
            input.ignoreAssignmentId || null
        );
        if (rows[0]) throw new Error("An active All Doctors layout already exists. Deactivate it before adding another.");
        return;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ doctor_id: number }>>(
        `
        SELECT ad.doctor_id
        FROM hms_print_layout_assignment_doctors ad
        INNER JOIN hms_print_layout_assignments a
          ON a.assignment_id = ad.assignment_id
        WHERE a.hospital_id = ?
          AND a.target_type = ?
          AND a.is_active = 1
          AND (? IS NULL OR a.assignment_id <> ?)
          AND ad.doctor_id IN (${input.doctorIds.map(() => "?").join(",")})
        `,
        input.hospitalId,
        input.targetType,
        input.ignoreAssignmentId || null,
        input.ignoreAssignmentId || null,
        ...input.doctorIds
    );

    if (rows.length > 0) {
        const label = input.targetType === "SPECIFIC_DOCTOR" ? "specific-doctor" : "doctor-group";
        throw new Error(`An active ${label} layout already covers one of the selected doctors. Deactivate it first.`);
    }
}

async function findReusableActiveAssignment(input: {
    hospitalId: number;
    targetType: HmsPrintLayoutTargetType;
    doctorIds: number[];
}) {
    if (input.targetType === "ALL_DOCTORS") {
        const rows = await prisma.$queryRawUnsafe<Array<{ assignment_id: number; layout_id: number }>>(
            `
            SELECT assignment_id, layout_id
            FROM hms_print_layout_assignments
            WHERE hospital_id = ?
              AND target_type = 'ALL_DOCTORS'
              AND is_active = 1
            ORDER BY assignment_id DESC
            LIMIT 1
            `,
            input.hospitalId
        );
        return rows[0] ? { assignmentId: Number(rows[0].assignment_id), layoutId: Number(rows[0].layout_id) } : null;
    }

    if (input.doctorIds.length === 0) return null;

    const rows = await prisma.$queryRawUnsafe<Array<{ assignment_id: number; layout_id: number; doctor_ids: string; doctor_count: bigint | number }>>(
        `
        SELECT
          a.assignment_id,
          a.layout_id,
          GROUP_CONCAT(ad.doctor_id ORDER BY ad.doctor_id SEPARATOR ',') AS doctor_ids,
          COUNT(ad.doctor_id) AS doctor_count
        FROM hms_print_layout_assignments a
        INNER JOIN hms_print_layout_assignment_doctors ad
          ON ad.assignment_id = a.assignment_id
        WHERE a.hospital_id = ?
          AND a.target_type = ?
          AND a.is_active = 1
        GROUP BY a.assignment_id, a.layout_id
        HAVING doctor_count = ?
           AND doctor_ids = ?
        LIMIT 1
        `,
        input.hospitalId,
        input.targetType,
        input.doctorIds.length,
        [...input.doctorIds].sort((left, right) => left - right).join(",")
    );

    return rows[0] ? { assignmentId: Number(rows[0].assignment_id), layoutId: Number(rows[0].layout_id) } : null;
}

export async function listHmsPrintLayoutDoctors(hospitalId: number) {
    const rows = await prisma.$queryRawUnsafe<DoctorRow[]>(
        `
        SELECT d.doctor_id, d.doctor_name, hd.room_no
        FROM hospital_doctors hd
        INNER JOIN doctors d
          ON d.doctor_id = hd.doctor_id
        WHERE hd.hospital_id = ?
        ORDER BY d.doctor_name ASC, d.doctor_id ASC
        `,
        hospitalId
    );

    return rows.map((row) => ({
        doctor_id: Number(row.doctor_id),
        doctor_name: row.doctor_name,
        room_no: row.room_no,
    }));
}

export async function listHmsPrintLayouts(hospitalId: number) {
    const [layouts, assignmentDoctors] = await Promise.all([
        prisma.$queryRawUnsafe<LayoutRow[]>(
            `
            SELECT
              l.layout_id,
              l.hospital_id,
              l.layout_name,
              l.description,
              l.layout_config_json,
              l.header_config_json,
              l.is_active,
              l.created_at,
              l.updated_at,
              a.target_type,
              a.assignment_id
            FROM hms_print_layouts l
            LEFT JOIN hms_print_layout_assignments a
              ON a.layout_id = l.layout_id
             AND a.is_active = 1
            WHERE l.hospital_id = ?
            ORDER BY l.is_active DESC, l.updated_at DESC, l.layout_id DESC
            `,
            hospitalId
        ),
        prisma.$queryRawUnsafe<AssignmentDoctorRow[]>(
            `
            SELECT ad.assignment_id, ad.doctor_id
            FROM hms_print_layout_assignment_doctors ad
            INNER JOIN hms_print_layout_assignments a
              ON a.assignment_id = ad.assignment_id
            WHERE a.hospital_id = ?
            `,
            hospitalId
        ),
    ]);

    const doctorsByAssignment = new Map<number, number[]>();
    for (const row of assignmentDoctors) {
        const assignmentId = Number(row.assignment_id);
        const next = doctorsByAssignment.get(assignmentId) || [];
        next.push(Number(row.doctor_id));
        doctorsByAssignment.set(assignmentId, next);
    }

    return layouts.map((row) => ({
        layout_id: Number(row.layout_id),
        hospital_id: Number(row.hospital_id),
        layout_name: row.layout_name,
        description: row.description,
        layout_config_json: parseJsonObject(row.layout_config_json),
        header_config_json: parseJsonObject(row.header_config_json),
        is_active: row.is_active === true || row.is_active === 1,
        created_at: row.created_at,
        updated_at: row.updated_at,
        assignment: row.assignment_id
            ? {
                assignment_id: Number(row.assignment_id),
                target_type: row.target_type,
                doctor_ids: doctorsByAssignment.get(Number(row.assignment_id)) || [],
            }
            : null,
    }));
}

export async function createHmsPrintLayout(input: SaveInput) {
    await assertDoctorsBelongToHospital(input.hospitalId, input.doctorIds);
    const reusable = await findReusableActiveAssignment({
        hospitalId: input.hospitalId,
        targetType: input.targetType,
        doctorIds: input.doctorIds,
    });
    await assertNoAmbiguousActiveAssignment({
        hospitalId: input.hospitalId,
        targetType: input.targetType,
        doctorIds: input.doctorIds,
        ignoreAssignmentId: reusable?.assignmentId || null,
    });

    return prisma.$transaction(async (tx) => {
        if (reusable) {
            await tx.$executeRawUnsafe(
                `
                UPDATE hms_print_layouts
                SET layout_name = ?,
                    description = ?,
                    layout_config_json = ?,
                    header_config_json = ?,
                    updated_by_user_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE hospital_id = ?
                  AND layout_id = ?
                `,
                input.layoutName,
                input.description || null,
                JSON.stringify(input.layoutConfig),
                JSON.stringify(input.headerConfig),
                input.userId,
                input.hospitalId,
                reusable.layoutId
            );

            await tx.$executeRawUnsafe(
                `
                UPDATE hms_print_layout_assignments
                SET assignment_name = ?,
                    updated_by_user_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE hospital_id = ?
                  AND assignment_id = ?
                `,
                `${input.layoutName} - ${input.targetType.replaceAll("_", " ")}`,
                input.userId,
                input.hospitalId,
                reusable.assignmentId
            );

            return { layout_id: reusable.layoutId, assignment_id: reusable.assignmentId };
        }

        await tx.$executeRawUnsafe(
            `
            INSERT INTO hms_print_layouts (
              hospital_id,
              layout_name,
              description,
              layout_config_json,
              header_config_json,
              is_active,
              created_by_user_id,
              updated_by_user_id
            )
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            `,
            input.hospitalId,
            input.layoutName,
            input.description || null,
            JSON.stringify(input.layoutConfig),
            JSON.stringify(input.headerConfig),
            input.userId,
            input.userId
        );
        const insertedLayouts = await tx.$queryRawUnsafe<Array<{ id: bigint | number }>>("SELECT LAST_INSERT_ID() AS id");
        const layoutId = Number(insertedLayouts[0]?.id || 0);
        if (!layoutId) throw new Error("Unable to create layout.");

        await tx.$executeRawUnsafe(
            `
            INSERT INTO hms_print_layout_assignments (
              hospital_id,
              layout_id,
              assignment_name,
              target_type,
              is_active,
              created_by_user_id,
              updated_by_user_id
            )
            VALUES (?, ?, ?, ?, 1, ?, ?)
            `,
            input.hospitalId,
            layoutId,
            `${input.layoutName} - ${input.targetType.replaceAll("_", " ")}`,
            input.targetType,
            input.userId,
            input.userId
        );
        const insertedAssignments = await tx.$queryRawUnsafe<Array<{ id: bigint | number }>>("SELECT LAST_INSERT_ID() AS id");
        const assignmentId = Number(insertedAssignments[0]?.id || 0);
        if (!assignmentId) throw new Error("Unable to assign layout.");

        for (const doctorId of input.doctorIds) {
            await tx.$executeRawUnsafe(
                `
                INSERT INTO hms_print_layout_assignment_doctors (assignment_id, doctor_id)
                VALUES (?, ?)
                `,
                assignmentId,
                doctorId
            );
        }

        return { layout_id: layoutId, assignment_id: assignmentId };
    });
}

export async function resolveHmsPrintLayoutForDoctor(input: {
    hospitalId: number;
    doctorId: number;
}) {
    const rows = await prisma.$queryRawUnsafe<LayoutRow[]>(
        `
        SELECT
          l.layout_id,
          l.hospital_id,
          l.layout_name,
          l.description,
          l.layout_config_json,
          l.header_config_json,
          l.is_active,
          l.created_at,
          l.updated_at,
          a.target_type,
          a.assignment_id
        FROM hms_print_layout_assignments a
        INNER JOIN hms_print_layouts l
          ON l.layout_id = a.layout_id
         AND l.hospital_id = a.hospital_id
         AND l.is_active = 1
        LEFT JOIN hms_print_layout_assignment_doctors ad
          ON ad.assignment_id = a.assignment_id
         AND ad.doctor_id = ?
        WHERE a.hospital_id = ?
          AND a.is_active = 1
          AND (
            a.target_type = 'ALL_DOCTORS'
            OR ad.doctor_id IS NOT NULL
          )
        ORDER BY
          CASE
            WHEN a.target_type = 'SPECIFIC_DOCTOR' THEN 0
            WHEN a.target_type = 'DOCTOR_GROUP' THEN 1
            ELSE 2
          END,
          l.updated_at DESC,
          l.layout_id DESC
        LIMIT 1
        `,
        input.doctorId,
        input.hospitalId
    );

    const row = rows[0];
    if (!row) return null;

    return {
        layout_id: Number(row.layout_id),
        layout_name: row.layout_name,
        layout_config_json: parseJsonObject(row.layout_config_json),
        header_config_json: parseJsonObject(row.header_config_json),
        target_type: row.target_type,
    };
}

export async function deactivateHmsPrintLayout(input: {
    hospitalId: number;
    layoutId: number;
    userId: number;
}) {
    const updated = await prisma.$executeRawUnsafe(
        `
        UPDATE hms_print_layouts
        SET is_active = 0,
            updated_by_user_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE hospital_id = ?
          AND layout_id = ?
        `,
        input.userId,
        input.hospitalId,
        input.layoutId
    );

    if (updated === 0) return false;

    await prisma.$executeRawUnsafe(
        `
        UPDATE hms_print_layout_assignments
        SET is_active = 0,
            updated_by_user_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE hospital_id = ?
          AND layout_id = ?
        `,
        input.userId,
        input.hospitalId,
        input.layoutId
    );

    return true;
}
