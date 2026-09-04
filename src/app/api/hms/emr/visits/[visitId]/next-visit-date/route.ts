import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  getHmsEmrAccessErrorResponse,
  resolveHmsDoctorVisitEmrScope,
} from "@/lib/hms-emr";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ visitId: string }> };

function dateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDayOfWeek(dateText: string) {
  return new Date(`${dateText}T12:00:00Z`).getUTCDay();
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { visitId } = await context.params;
    const scope = await resolveHmsDoctorVisitEmrScope(req, visitId);
    const days = Number(req.nextUrl.searchParams.get("days"));
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: "A valid follow-up interval is required." }, { status: 400 });
    }

    const baseDate = dateOnly(scope.visit.visit_date) ?? new Date().toISOString().slice(0, 10);
    const targetDate = addDays(baseDate, days);
    const [policyRows, holidayRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ policies: unknown }>>(
        `SELECT policies FROM hospital_policy_settings WHERE hospital_id = ? LIMIT 1`,
        scope.hospital.hospitalId
      ),
      prisma.$queryRawUnsafe<Array<{ holiday_date: Date | string }>>(
        `
        SELECT holiday_date
        FROM hospital_holidays
        WHERE hospital_id = ?
          AND holiday_date >= ?
          AND holiday_date <= ?
        `,
        scope.hospital.hospitalId,
        targetDate,
        addDays(targetDate, 366)
      ),
    ]);
    const policies = parseObject(policyRows[0]?.policies);
    const workingDays = Array.isArray(policies.working_days)
      ? Array.from(new Set(policies.working_days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)))
      : [0, 1, 2, 3, 4, 5, 6];
    const allowedWorkingDays = workingDays.length > 0 ? workingDays : [0, 1, 2, 3, 4, 5, 6];
    const holidays = new Set(holidayRows.map((row) => dateOnly(row.holiday_date)));

    let resolvedDate = targetDate;
    for (let attempts = 0; attempts <= 366; attempts += 1) {
      if (allowedWorkingDays.includes(getDayOfWeek(resolvedDate)) && !holidays.has(resolvedDate)) {
        return NextResponse.json({ date: resolvedDate });
      }
      resolvedDate = addDays(resolvedDate, 1);
    }

    return NextResponse.json({ error: "Unable to find the next hospital working day." }, { status: 409 });
  } catch (error) {
    const response = getHmsEmrAccessErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
