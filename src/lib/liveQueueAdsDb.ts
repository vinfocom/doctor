export function isMissingLiveQueueAdsTableError(error: unknown) {
    const candidate = error as { code?: string; meta?: { table?: string }; message?: string };
    if (candidate?.code !== "P2021") {
        return false;
    }

    const table = String(candidate?.meta?.table || "");
    const message = String(candidate?.message || "");

    return table.includes("live_queue_side_ads") || message.includes("live_queue_side_ads");
}

