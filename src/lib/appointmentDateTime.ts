const IST_OFFSET_MINUTES = 5.5 * 60;

const pad = (value: number) => String(value).padStart(2, "0");

export const parseISTDate = (dateStr: string): Date => {
    const ymd = String(dateStr).slice(0, 10);
    return new Date(`${ymd}T00:00:00.000Z`);
};

export const parseISTTimeToUTCDate = (timeStr: string): Date => {
    const [hours, minutes] = String(timeStr).slice(0, 5).split(":").map(Number);
    const utcMillis = Date.UTC(1970, 0, 1, hours || 0, minutes || 0) - IST_OFFSET_MINUTES * 60 * 1000;
    return new Date(utcMillis);
};

export const formatUTCDateToISTTime = (value: Date | string | null | undefined): string => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
    }).format(date);
};

export const formatDateToISTYMD = (value: Date | string | null | undefined): string => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const parts = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Kolkata",
    }).formatToParts(date);

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    return year && month && day ? `${year}-${month}-${day}` : "";
};

export const getISTNowYMD = () => formatDateToISTYMD(new Date());

export const getISTDayOfWeek = (dateStr: string): number => {
    const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
    // Normalize to IST day-of-week with Sunday=0, Saturday=6 (matches UI day ids)
    const dow = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0)).getUTCDay();
    return dow;
};

export const addMinutesToTimeString = (timeStr: string, minutesToAdd: number): string => {
    const base = parseISTTimeToUTCDate(timeStr);
    const next = new Date(base.getTime() + minutesToAdd * 60 * 1000);
    return formatUTCDateToISTTime(next);
};

export const getISTDateParts = (value: Date) => {
    const ymd = formatDateToISTYMD(value);
    const [year, month, day] = ymd.split("-").map(Number);
    return {
        year: year || 0,
        month: month || 0,
        day: day || 0,
    };
};

export const formatMonthLabelInIST = (year: number, month: number) =>
    new Intl.DateTimeFormat("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    }).format(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)));

export const formatISTTimeLabel = (value: Date | string | null | undefined): string => {
    const hm = formatUTCDateToISTTime(value);
    if (!hm) return "";
    const [hours, minutes] = hm.split(":").map(Number);
    const suffix = (hours || 0) >= 12 ? "PM" : "AM";
    const hours12 = (hours || 0) % 12 || 12;
    return `${hours12}:${pad(minutes || 0)} ${suffix}`;
};
