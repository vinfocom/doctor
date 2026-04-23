export function isMissingPrismaTable(error: unknown, tableName?: string) {
    const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    const message = error instanceof Error ? error.message : String(error ?? "");

    if (code !== "P2021") {
        return false;
    }

    if (!tableName) {
        return true;
    }

    return message.includes(tableName);
}
