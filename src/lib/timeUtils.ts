export const formatTime = (date: Date | string | null | undefined): string => {
    if (!date) return "09:00";
    
    // If it's already a time string like "09:00" or "09:00:00"
    if (typeof date === "string") {
        if (date.includes("T")) {
            return date.split("T")[1].slice(0, 5);
        }
        return date.slice(0, 5);
    }

    // If it's a Date object
    if (date instanceof Date) {
        return date.toLocaleTimeString("en-GB", { 
            hour: "2-digit", 
            minute: "2-digit", 
            hour12: false, 
            timeZone: "UTC" // Prisma stores times as DateTime on 1970-01-01
        });
    }

    return "09:00";
};

export const parseTime = (timeStr: string): Date => {
    // Returns a Date object for 1970-01-01 at the specified time (UTC)
    // flexible input: "09:00"
    if (!timeStr) return new Date("1970-01-01T09:00:00Z");
    
    // Ensure format HH:mm
    const [hours, minutes] = timeStr.split(":").map(Number);
    
    const date = new Date(0); // 1970-01-01T00:00:00.000Z
    date.setUTCHours(hours || 0, minutes || 0, 0, 0);
    
    return date;
};
