import prisma from "@/lib/prisma";
import { formatDateToISTYMD, parseISTDate } from "@/lib/appointmentDateTime";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateInput(date: Date | string): string | null {
    if (date instanceof Date) {
        return formatDateToISTYMD(date);
    }

    const trimmed = String(date || "").slice(0, 10);
    return DATE_ONLY_REGEX.test(trimmed) ? trimmed : null;
}

export interface FullDayLeaveInfo {
    leave_id: number;
    reason: string;
}

export async function getDoctorFullDayLeave(
    doctorId: number,
    date: Date | string,
): Promise<FullDayLeaveInfo | null> {
    if (!Number.isFinite(Number(doctorId)) || Number(doctorId) <= 0) {
        return null;
    }

    const dateStr = normalizeDateInput(date);
    if (!dateStr) {
        return null;
    }

    const leave = await prisma.doctor_leaves.findFirst({
        where: {
            doctor_id: Number(doctorId),
            leave_date: parseISTDate(dateStr),
            start_time: null,
            end_time: null,
        },
        select: {
            leave_id: true,
            reason: true,
        },
    });

    if (!leave) {
        return null;
    }

    return {
        leave_id: leave.leave_id,
        reason: String(leave.reason || ""),
    };
}

export async function isDoctorOnFullDayLeave(
    doctorId: number,
    date: Date | string,
): Promise<boolean> {
    return Boolean(await getDoctorFullDayLeave(doctorId, date));
}
