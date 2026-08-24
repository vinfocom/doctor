export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { deriveHospitalSmsSnapshot, toHospitalSmsPayload } from "@/lib/hospitalSms";

type RouteContext = {
    params: Promise<{
        hospitalId: string;
    }>;
};

type HospitalRow = {
    hospital_id: number;
};

type HospitalSmsRow = {
    hospital_sms_service_id: number;
    hospital_id: number;
    sms_service_enabled: boolean | number;
    sms_service_status: string;
    sms_credit_total: number;
    sms_credit_used: number;
    current_pack_total: number;
    current_pack_used: number;
    last_recharged_at: Date | string | null;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeCredits(value: unknown) {
    if (value === undefined || value === null || value === "") return 0;
    const credits = Number(value);
    return Number.isInteger(credits) && credits >= 0 ? credits : null;
}

function normalizeRemarks(value: unknown) {
    const remarks = String(value || "").trim();
    return remarks ? remarks.slice(0, 500) : null;
}

async function requireSuperAdmin(req: Request) {
    const session = await getSessionFromRequest(req);
    return session?.role === "SUPER_ADMIN" ? session : null;
}

export async function PATCH(req: Request, context: RouteContext) {
    try {
        const session = await requireSuperAdmin(req);
        if (!session) {
            return NextResponse.json({ error: "Only Super Admin can update hospital SMS." }, { status: 403 });
        }

        const { hospitalId: hospitalIdParam } = await context.params;
        const hospitalId = normalizeId(hospitalIdParam);
        if (!hospitalId) {
            return NextResponse.json({ error: "Valid hospital id is required." }, { status: 400 });
        }

        const body = await req.json();
        const enabled = body?.sms_service_enabled === undefined ? null : Boolean(body.sms_service_enabled);
        const rechargeCredits = normalizeCredits(body?.sms_recharge_credits);
        const remarks = normalizeRemarks(body?.sms_recharge_remarks);

        if (enabled === null && rechargeCredits === 0) {
            return NextResponse.json({ error: "Change SMS status or add recharge credits." }, { status: 400 });
        }

        if (rechargeCredits === null) {
            return NextResponse.json({ error: "SMS recharge credits must be a positive whole number." }, { status: 400 });
        }

        const hospitalRows = await prisma.$queryRawUnsafe<HospitalRow[]>(
            `
            SELECT hospital_id
            FROM hospitals
            WHERE hospital_id = ?
            LIMIT 1
            `,
            hospitalId
        );

        if (!hospitalRows[0]) {
            return NextResponse.json({ error: "Hospital was not found." }, { status: 404 });
        }

        const updated = await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
                `
                INSERT INTO hospital_sms_service (hospital_id)
                VALUES (?)
                ON DUPLICATE KEY UPDATE hospital_id = hospital_id
                `,
                hospitalId
            );

            const serviceRows = await tx.$queryRawUnsafe<HospitalSmsRow[]>(
                `
                SELECT
                    hospital_sms_service_id,
                    hospital_id,
                    sms_service_enabled,
                    sms_service_status,
                    sms_credit_total,
                    sms_credit_used,
                    current_pack_total,
                    current_pack_used,
                    last_recharged_at
                FROM hospital_sms_service
                WHERE hospital_id = ?
                LIMIT 1
                FOR UPDATE
                `,
                hospitalId
            );

            const service = serviceRows[0];
            if (!service) throw new Error("Hospital SMS service row was not created.");

            let lifetimeTotal = Number(service.sms_credit_total || 0);
            const lifetimeUsed = Number(service.sms_credit_used || 0);
            let currentPackTotal = Number(service.current_pack_total || 0);
            let currentPackUsed = Number(service.current_pack_used || 0);
            let nextEnabled = Boolean(service.sms_service_enabled);
            let lastRechargedAt = service.last_recharged_at;

            if (enabled !== null) {
                nextEnabled = enabled;
            }

            if (rechargeCredits > 0) {
                const currentSnapshot = deriveHospitalSmsSnapshot({
                    sms_service_enabled: nextEnabled,
                    sms_credit_total: lifetimeTotal,
                    sms_credit_used: lifetimeUsed,
                    current_pack_total: currentPackTotal,
                    current_pack_used: currentPackUsed,
                });
                const currentRemaining = currentSnapshot.remainingCredits;
                const previousTotal = lifetimeTotal;

                lifetimeTotal += rechargeCredits;
                if (currentRemaining > 0) {
                    currentPackTotal += rechargeCredits;
                } else {
                    currentPackTotal = rechargeCredits;
                    currentPackUsed = 0;
                }
                lastRechargedAt = new Date();

                await tx.$executeRawUnsafe(
                    `
                    INSERT INTO hospital_sms_recharge_log (
                        hospital_id,
                        credits_added,
                        previous_total,
                        new_total,
                        previous_pack_remaining,
                        new_pack_total,
                        remarks,
                        recharged_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    hospitalId,
                    rechargeCredits,
                    previousTotal,
                    lifetimeTotal,
                    currentRemaining,
                    currentPackTotal,
                    remarks,
                    session.userId
                );
            }

            const snapshot = deriveHospitalSmsSnapshot({
                sms_service_enabled: nextEnabled,
                sms_credit_total: lifetimeTotal,
                sms_credit_used: lifetimeUsed,
                current_pack_total: currentPackTotal,
                current_pack_used: currentPackUsed,
            });

            if (rechargeCredits > 0) {
                await tx.$executeRawUnsafe(
                    `
                    UPDATE hospital_sms_service
                    SET sms_service_enabled = ?,
                        sms_service_status = ?,
                        sms_credit_total = ?,
                        sms_credit_used = ?,
                        current_pack_total = ?,
                        current_pack_used = ?,
                        last_recharged_at = ?,
                        low_balance_alerted_at = NULL,
                        exhausted_alerted_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE hospital_id = ?
                    `,
                    nextEnabled ? 1 : 0,
                    snapshot.status,
                    lifetimeTotal,
                    lifetimeUsed,
                    currentPackTotal,
                    currentPackUsed,
                    lastRechargedAt,
                    hospitalId
                );
            } else {
                await tx.$executeRawUnsafe(
                    `
                    UPDATE hospital_sms_service
                    SET sms_service_enabled = ?,
                        sms_service_status = ?,
                        sms_credit_total = ?,
                        sms_credit_used = ?,
                        current_pack_total = ?,
                        current_pack_used = ?,
                        last_recharged_at = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE hospital_id = ?
                    `,
                    nextEnabled ? 1 : 0,
                    snapshot.status,
                    lifetimeTotal,
                    lifetimeUsed,
                    currentPackTotal,
                    currentPackUsed,
                    lastRechargedAt,
                    hospitalId
                );
            }

            return toHospitalSmsPayload({
                sms_service_enabled: nextEnabled,
                sms_credit_total: lifetimeTotal,
                sms_credit_used: lifetimeUsed,
                current_pack_total: currentPackTotal,
                current_pack_used: currentPackUsed,
            });
        });

        return NextResponse.json({ sms_service: updated });
    } catch (error) {
        console.error("Update HMS hospital SMS error:", error);
        return NextResponse.json({ error: "Unable to update hospital SMS settings." }, { status: 500 });
    }
}
