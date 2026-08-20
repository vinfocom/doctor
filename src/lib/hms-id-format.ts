type RawDb = {
    $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
    $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

export type HmsSequenceType = "UHID" | "OPD" | "CASUALTY" | "TEMP_TOKEN" | "TVTOKEN";

type SequenceResetMode =
    | "never"
    | "reset_on_new_year"
    | "carry_on_new_year"
    | "reset_on_new_financial_year";

type SequenceResetConfig = {
    uhid?: SequenceResetMode;
    opd?: SequenceResetMode;
    casualty?: SequenceResetMode;
};

type IdFormatSegment =
    | { type: "static"; value: string }
    | { type: "hospital_code" }
    | { type: "sequence"; sequence_type: HmsSequenceType; pad_to?: number }
    | { type: "calendar_year"; format?: "YYYY" | "YY" }
    | { type: "financial_year"; format?: "YYYY-YY" | "YY-YY" }
    | { type: "date"; format?: "YYYYMMDD" | "YYYY-MM-DD" | "DDMMYYYY" }
    | { type: "room_number" }
    | { type: "separator"; value: string };

export type HmsIdFormatConfig = {
    uhid?: IdFormatSegment[];
    opd?: IdFormatSegment[];
    casualty?: IdFormatSegment[];
    sequence_reset?: SequenceResetConfig;
};

type InsertIdRow = {
    value: bigint | number;
};

type DateSegmentFormat = "YYYYMMDD" | "YYYY-MM-DD" | "DDMMYYYY" | undefined;

function parseJsonObject(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value !== "string") return null;

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

export function extractIdFormatConfig(policies: unknown): HmsIdFormatConfig | null {
    const policyObject = parseJsonObject(policies);
    const idFormat = policyObject?.id_format;

    if (!idFormat || typeof idFormat !== "object") return null;

    return idFormat as HmsIdFormatConfig;
}

function getIstDateParts(now: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
    };
}

function getCalendarYear(now: Date) {
    return String(getIstDateParts(now).year);
}

function getCalendarYearShort(now: Date) {
    return String(getIstDateParts(now).year).slice(-2);
}

function getFinancialYearParts(now: Date) {
    const { month, year } = getIstDateParts(now);
    const startYear = month >= 4 ? year : year - 1;
    const endYear = startYear + 1;

    return {
        startYear,
        endYear,
        full: `${startYear}-${String(endYear).slice(-2)}`,
        short: `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`,
    };
}

function getDateSegment(now: Date, format: DateSegmentFormat) {
    const parts = getIstDateParts(now);
    const yyyy = String(parts.year);
    const mm = String(parts.month).padStart(2, "0");
    const dd = String(parts.day).padStart(2, "0");

    if (format === "YYYY-MM-DD") return `${yyyy}-${mm}-${dd}`;
    if (format === "DDMMYYYY") return `${dd}${mm}${yyyy}`;
    return `${yyyy}${mm}${dd}`;
}

function getPeriodKey(input: {
    resetMode: SequenceResetMode;
    segments: IdFormatSegment[];
    now: Date;
}) {
    if (input.resetMode === "never" || input.resetMode === "carry_on_new_year") {
        return "";
    }

    if (input.resetMode === "reset_on_new_year") {
        if (!input.segments.some((segment) => segment.type === "calendar_year")) {
            throw new Error("ID format uses yearly reset but has no calendar_year segment.");
        }
        return getCalendarYear(input.now);
    }

    if (!input.segments.some((segment) => segment.type === "financial_year")) {
        throw new Error("ID format uses financial-year reset but has no financial_year segment.");
    }

    return getFinancialYearParts(input.now).full;
}

function getResetMode(input: {
    idFormat: HmsIdFormatConfig;
    formatKey: "uhid" | "opd" | "casualty";
}) {
    const resetMode = input.idFormat.sequence_reset?.[input.formatKey];
    if (
        resetMode === "never" ||
        resetMode === "reset_on_new_year" ||
        resetMode === "carry_on_new_year" ||
        resetMode === "reset_on_new_financial_year"
    ) {
        return resetMode;
    }

    throw new Error(`Sequence reset is not configured for ${input.formatKey}.`);
}

async function allocateSequence(input: {
    db: RawDb;
    hospitalId: number;
    sequenceType: HmsSequenceType;
    periodKey: string;
}) {
    await input.db.$executeRawUnsafe(
        `
        INSERT INTO hospital_sequence_counters (hospital_id, sequence_type, period_key, current_seq)
        VALUES (?, ?, ?, 0)
        ON DUPLICATE KEY UPDATE current_seq = current_seq
        `,
        input.hospitalId,
        input.sequenceType,
        input.periodKey
    );

    await input.db.$executeRawUnsafe(
        `
        UPDATE hospital_sequence_counters
        SET current_seq = LAST_INSERT_ID(current_seq + 1)
        WHERE hospital_id = ? AND sequence_type = ? AND period_key = ?
        `,
        input.hospitalId,
        input.sequenceType,
        input.periodKey
    );

    const rows = await input.db.$queryRawUnsafe<InsertIdRow[]>("SELECT LAST_INSERT_ID() AS value");
    const nextValue = rows[0]?.value;

    return typeof nextValue === "bigint" ? Number(nextValue) : Number(nextValue || 0);
}

export async function allocateHmsSequence(input: {
    db: RawDb;
    hospitalId: number;
    sequenceType: HmsSequenceType;
    periodKey: string;
}) {
    return allocateSequence(input);
}

export async function resolveHmsId(input: {
    db: RawDb;
    hospitalId: number;
    hospitalCode: string;
    idFormat: HmsIdFormatConfig;
    formatKey: "uhid" | "opd" | "casualty";
    now?: Date;
    roomNumber?: string | null;
}) {
    const segments = input.idFormat[input.formatKey];
    if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error(`ID format is not configured for ${input.formatKey}.`);
    }

    const now = input.now || new Date();
    const resetMode = getResetMode({ idFormat: input.idFormat, formatKey: input.formatKey });
    const periodKey = getPeriodKey({ resetMode, segments, now });
    const parts: string[] = [];

    for (const segment of segments) {
        if (segment.type === "static" || segment.type === "separator") {
            parts.push(segment.value);
        } else if (segment.type === "hospital_code") {
            parts.push(input.hospitalCode);
        } else if (segment.type === "calendar_year") {
            parts.push(segment.format === "YY" ? getCalendarYearShort(now) : getCalendarYear(now));
        } else if (segment.type === "financial_year") {
            const financialYear = getFinancialYearParts(now);
            parts.push(segment.format === "YY-YY" ? financialYear.short : financialYear.full);
        } else if (segment.type === "date") {
            parts.push(getDateSegment(now, segment.format));
        } else if (segment.type === "room_number") {
            const roomNumber = String(input.roomNumber || "").trim();
            if (!roomNumber) {
                throw new Error("ID format requires a room number, but no room number is configured.");
            }
            parts.push(roomNumber);
        } else if (segment.type === "sequence") {
            const sequence = await allocateSequence({
                db: input.db,
                hospitalId: input.hospitalId,
                sequenceType: segment.sequence_type,
                periodKey,
            });

            if (!sequence) {
                throw new Error("Unable to allocate sequence number.");
            }

            parts.push(String(sequence).padStart(segment.pad_to || 1, "0"));
        } else {
            throw new Error("Unsupported ID format segment.");
        }
    }

    return parts.join("");
}
