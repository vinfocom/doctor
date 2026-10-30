import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSessionFromRequest } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

async function patientFor(req: Request): Promise<number | null> {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "PATIENT") return null;
  const id = Number(session.patientId ?? session.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function localDateIn(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateColumnValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

type WellnessTestRow = Awaited<ReturnType<typeof prisma.wellness_test_results.findMany>>[number];
type WellnessCompletionRow = Awaited<ReturnType<typeof prisma.wellness_activity_completions.findMany>>[number];

function serializeTest(row: WellnessTestRow) {
  return { ...row, result_id: String(row.result_id), result_value: row.result_value == null ? null : String(row.result_value) };
}

function serializeCompletion(row: WellnessCompletionRow) {
  return { ...row, completion_id: String(row.completion_id), completion_date_local: dateColumnValue(row.completion_date_local) };
}

export async function GET(req: Request) {
  try {
    const patientId = await patientFor(req);
    if (!patientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "all";

    if (view === "tests" || view === "all") {
      const takeParam = Number(url.searchParams.get("take") || 50);
      const take = Number.isInteger(takeParam) ? Math.min(Math.max(takeParam, 1), 100) : 50;
      const cursorParam = url.searchParams.get("cursor");
      if (cursorParam && (!/^\d+$/.test(cursorParam) || cursorParam.length > 20)) return NextResponse.json({ error: "Invalid history cursor." }, { status: 400 });
      const cursor = cursorParam ? BigInt(cursorParam) : undefined;
      if (cursor) {
        const ownedCursor = await prisma.wellness_test_results.findFirst({ where: { patient_id: patientId, result_id: cursor }, select: { result_id: true } });
        if (!ownedCursor) return NextResponse.json({ error: "Invalid history cursor." }, { status: 400 });
      }
      const results = await prisma.wellness_test_results.findMany({
        where: { patient_id: patientId },
        orderBy: [{ completed_at: "desc" }, { result_id: "desc" }],
        ...(cursor ? { cursor: { result_id: cursor }, skip: 1 } : {}),
        take: take + 1,
      });
      const hasMore = results.length > take;
      const page = results.slice(0, take);
      const serialized = page.map(serializeTest);
      const nextCursor = hasMore && page.length ? String(page[page.length - 1].result_id) : null;
      if (view === "tests") return NextResponse.json({ results: serialized, hasMore, nextCursor });
      const completions = await prisma.wellness_activity_completions.findMany({ where: { patient_id: patientId }, orderBy: { completed_at: "desc" }, take: 100 });
      return NextResponse.json({ results: serialized, hasMore, nextCursor, completions: completions.map(serializeCompletion) });
    }

    if (view === "completions") {
      const where = { patient_id: patientId };
      const [completions, activeDays] = await Promise.all([
        prisma.wellness_activity_completions.findMany({ where, orderBy: { completed_at: "desc" }, take: 100 }),
        prisma.wellness_activity_completions.groupBy({ by: ["completion_date_local"], where, orderBy: { completion_date_local: "desc" } }),
      ]);
      return NextResponse.json({
        completions: completions.map(serializeCompletion),
        active_dates: activeDays.map((item) => dateColumnValue(item.completion_date_local)),
      });
    }

    if (view === "exposures") {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await prisma.wellness_content_exposures.deleteMany({ where: { patient_id: patientId, shown_at: { lt: cutoff } } });
      const exposures = await prisma.wellness_content_exposures.findMany({
        where: { patient_id: patientId, shown_at: { gte: cutoff } },
        select: { content_type: true, content_id: true },
        distinct: ["content_type", "content_id"],
      });
      return NextResponse.json({ exposures });
    }

    return NextResponse.json({ error: "Unknown Wellness view." }, { status: 400 });
  } catch (error) {
    console.error("Patient Wellness read failed:", error);
    return NextResponse.json({ error: "Could not load Wellness data." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const patientId = await patientFor(req);
    if (!patientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();

    if (body.kind === "exposure") {
      const { content_type, content_id } = body;
      if (!/^(GAME|QUIZ|COLOR_VISION)$/.test(String(content_type)) || typeof content_id !== "string" || content_id.length < 1 || content_id.length > 120) {
        return NextResponse.json({ error: "Invalid content exposure." }, { status: 400 });
      }
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const existing = await prisma.wellness_content_exposures.findFirst({
        where: { patient_id: patientId, content_type, content_id, shown_at: { gte: cutoff } },
        select: { exposure_id: true },
      });
      if (!existing) await prisma.wellness_content_exposures.create({ data: { patient_id: patientId, content_type, content_id } });
      return NextResponse.json({ saved: true });
    }

    if (body.kind === "completion") {
      const { activity_type, activity_id, timezone } = body;
      if (!/^(GAME|QUIZ|RELAX)$/.test(String(activity_type)) || typeof activity_id !== "string" || activity_id.length < 1 || activity_id.length > 120 || typeof timezone !== "string" || timezone.length > 64) {
        return NextResponse.json({ error: "Invalid activity completion." }, { status: 400 });
      }
      try { localDateIn(timezone); } catch { return NextResponse.json({ error: "Invalid timezone." }, { status: 400 }); }
      const firstCompletion = await prisma.wellness_activity_completions.findFirst({
        where: { patient_id: patientId },
        orderBy: { completed_at: "asc" },
        select: { timezone: true },
      });
      const stableTimezone = firstCompletion?.timezone || timezone;
      const localDate = localDateIn(stableTimezone);
      await prisma.wellness_activity_completions.create({
          data: {
            patient_id: patientId,
            activity_type,
            activity_id,
            completed_at: new Date(),
            completion_date_local: new Date(`${localDate}T00:00:00.000Z`),
            timezone: stableTimezone,
          },
        });
      return NextResponse.json({ saved: true, completion_date_local: localDate, timezone: stableTimezone });
    }

    if (body.kind === "test") {
      const { test_type, method_version, result_value, result_unit, result_summary, result_details } = body;
      if (typeof test_type !== "string" || test_type.length < 1 || test_type.length > 50 || typeof result_summary !== "string" || !result_summary.trim() || result_summary.length > 500) {
        return NextResponse.json({ error: "Invalid screening result." }, { status: 400 });
      }
      const numericValue = result_value == null ? null : Number(result_value);
      if (numericValue !== null && !Number.isFinite(numericValue)) return NextResponse.json({ error: "Invalid result value." }, { status: 400 });
      let safeDetails: Prisma.InputJsonValue | undefined;
      if (result_details != null) {
        if (!["HEARING", "COLOR_VISION"].includes(test_type) || typeof result_details !== "object" || Array.isArray(result_details) || JSON.stringify(result_details).length > 5000) {
          return NextResponse.json({ error: "Invalid screening details." }, { status: 400 });
        }
        const details = result_details as { schema_version?: unknown; frequencies?: unknown; catch_trials?: unknown; responses?: unknown };
        if (test_type === "HEARING") {
          if (details.schema_version !== 1 || !Array.isArray(details.frequencies) || details.frequencies.length !== 6 || typeof details.catch_trials !== "object" || details.catch_trials == null) {
            return NextResponse.json({ error: "Invalid hearing screening details." }, { status: 400 });
          }
          const expected = [250, 500, 1000, 2000, 4000, 8000];
          const validFrequencyRows = details.frequencies.every((row: any, index: number) => row && row.hz === expected[index] && ["left", "right"].every((side) => row[side] && typeof row[side].heard === "boolean" && Number.isInteger(row[side].trials) && row[side].trials >= 1 && row[side].trials <= 2));
          const catches = details.catch_trials as Record<string, unknown>;
          if (!validFrequencyRows || !["left", "right"].every((side) => catches[side] === null || typeof catches[side] === "boolean")) {
            return NextResponse.json({ error: "Invalid hearing screening details." }, { status: 400 });
          }
        } else {
          const plateAnswers = new Map<string, { level: number; answer: number }>([
            ["level-1-easy/plate-01-8", { level: 1, answer: 8 }], ["level-1-easy/plate-02-6", { level: 1, answer: 6 }], ["level-1-easy/plate-03-29", { level: 1, answer: 29 }], ["level-1-easy/plate-04-57", { level: 1, answer: 57 }], ["level-1-easy/plate-05-3", { level: 1, answer: 3 }],
            ["level-2-moderate/plate-06-15", { level: 2, answer: 15 }], ["level-2-moderate/plate-07-26", { level: 2, answer: 26 }], ["level-2-moderate/plate-08-45", { level: 2, answer: 45 }], ["level-2-moderate/plate-09-74", { level: 2, answer: 74 }], ["level-2-moderate/plate-10-5", { level: 2, answer: 5 }],
            ["level-3-challenging/plate-11-16", { level: 3, answer: 16 }], ["level-3-challenging/plate-12-42", { level: 3, answer: 42 }], ["level-3-challenging/plate-13-73", { level: 3, answer: 73 }], ["level-3-challenging/plate-14-8", { level: 3, answer: 8 }], ["level-3-challenging/plate-15-35", { level: 3, answer: 35 }],
          ]);
          const responses = details.responses as any;
          const levelCounts = [0, 0, 0];
          const seenPlates = new Set<string>();
          const validResponses = details.schema_version === 1 && Array.isArray(responses) && responses.length === 6 && responses.every((row: any) => {
            if (!row || typeof row.plate_id !== "string" || seenPlates.has(row.plate_id)) return false;
            const plate = plateAnswers.get(row.plate_id);
            if (!plate || row.level !== plate.level || !Number.isInteger(row.selected_value) || row.correct_value !== plate.answer || typeof row.correct !== "boolean" || row.correct !== (row.selected_value === plate.answer)) return false;
            seenPlates.add(row.plate_id);
            levelCounts[plate.level - 1] += 1;
            return true;
          });
          const score = validResponses ? responses.filter((row: any) => row.correct).length : -1;
          if (!validResponses || levelCounts.some((count) => count !== 2) || method_version !== "color-vision-plates-v1" || result_unit !== "of 6 plates" || numericValue !== score) {
            return NextResponse.json({ error: "Invalid color vision result details." }, { status: 400 });
          }
        }
        safeDetails = result_details as Prisma.InputJsonValue;
      }
      const saved = await prisma.wellness_test_results.create({
        data: {
          patient_id: patientId,
          test_type,
          method_version: typeof method_version === "string" ? method_version.slice(0, 100) : null,
          result_value: numericValue,
          result_unit: typeof result_unit === "string" ? result_unit.slice(0, 40) : null,
          result_summary: result_summary.trim(),
          result_details: safeDetails,
        },
        select: { result_id: true },
      });
      return NextResponse.json({ saved: true, result_id: String(saved.result_id) }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown Wellness record type." }, { status: 400 });
  } catch (error) {
    console.error("Patient Wellness save failed:", error);
    return NextResponse.json({ error: "Could not save Wellness data." }, { status: 500 });
  }
}
