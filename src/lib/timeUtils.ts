export const formatTime = (date: Date | string | null | undefined): string => {
    if (!date) return "09:00";

    // If it's already a time string like "09:00" or "09:00:00" or "09:00 AM"
    if (typeof date === "string") {
        if (date.includes("T")) {
            return date.split("T")[1].slice(0, 5);
        }
        if (date.match(/AM|PM/i)) {
            return convertTo24Hour(date);
        }
        return date.slice(0, 5);
    }

    // If it's a Date object
    if (date instanceof Date) {
        return date.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "UTC"
        });
    }

    return "09:00";
};

export const parseTime = (timeStr: string): Date => {
    // Returns a Date object for 1970-01-01 at the specified time (UTC)
    if (!timeStr) return new Date("1970-01-01T09:00:00Z");

    let hours = 0;
    let minutes = 0;

    if (timeStr.match(/AM|PM/i)) {
        const time24 = convertTo24Hour(timeStr);
        [hours, minutes] = time24.split(":").map(Number);
    } else {
        [hours, minutes] = timeStr.split(":").map(Number);
    }

    const date = new Date(0); // 1970-01-01T00:00:00.000Z
    date.setUTCHours(hours || 0, minutes || 0, 0, 0);

    return date;
};

export const convertTo12Hour = (time24: string): string => {
    if (!time24) return "";
    const [hours, minutes] = time24.split(":").map(Number);
    const suffix = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12;
    // ensure minutes are 2 digits
    const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
    return `${hours12}:${minutesStr} ${suffix}`;
};

export const convertTo24Hour = (time12: string): string => {
    if (!time12) return "";
    // e.g. "09:00 AM" or "9:00 PM"
    const [time, modifier] = time12.split(" ");
    if (!modifier) return time; // fallback if no AM/PM

    let [hours, minutes] = time.split(":").map(Number);

    if (hours === 12) {
        hours = 0;
    }

    if (modifier.toUpperCase() === "PM") {
        hours = hours + 12;
    }

    // ensure 2 digits
    const hoursStr = hours < 10 ? `0${hours}` : hours;
    const minutesStr = minutes < 10 ? `0${minutes}` : minutes;

    return `${hoursStr}:${minutesStr}`;
};
