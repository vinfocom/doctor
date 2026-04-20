export type QueueSideAdPosition = "LEFT" | "RIGHT";
export type QueueSideAdType = "LOGO" | "VIDEO";

export type LiveQueueSideAd = {
    ad_id: number;
    doctor_id: number;
    clinic_id: number;
    position: QueueSideAdPosition;
    type: QueueSideAdType;
    asset_url: string;
    mime_type?: string | null;
    title?: string | null;
    is_active: boolean;
    active_from?: string | Date | null;
    active_to?: string | Date | null;
    sort_order: number;
    created_at?: string | Date;
    updated_at?: string | Date;
};

export type QueueSideAdStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE";

export function toDateInput(value: string | Date | null | undefined) {
    if (!value) {
        return "";
    }

    const raw = value instanceof Date ? value.toISOString() : String(value);
    return raw.slice(0, 10);
}

export function getTodayDateInput(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
    }).format(date);
}

export function getQueueSideAdStatus(ad: LiveQueueSideAd, referenceDate = getTodayDateInput()): QueueSideAdStatus {
    if (!ad.is_active) {
        return "INACTIVE";
    }

    const activeFrom = toDateInput(ad.active_from);
    const activeTo = toDateInput(ad.active_to);

    if (activeFrom && referenceDate < activeFrom) {
        return "SCHEDULED";
    }

    if (activeTo && referenceDate > activeTo) {
        return "EXPIRED";
    }

    return "ACTIVE";
}

export function isQueueSideAdDisplayable(ad: LiveQueueSideAd, referenceDate = getTodayDateInput()) {
    return getQueueSideAdStatus(ad, referenceDate) === "ACTIVE";
}

export function resolveSideAds(ads: LiveQueueSideAd[], position: QueueSideAdPosition) {
    const activeAds = ads
        .filter((ad) => isQueueSideAdDisplayable(ad) && ad.position === position)
        .sort((left, right) =>
            left.sort_order - right.sort_order ||
            new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime() ||
            left.ad_id - right.ad_id
        );

    const videos = activeAds.filter((ad) => ad.type === "VIDEO");

    if (videos.length > 0) {
        return {
            mode: "VIDEO" as const,
            video: videos[0],
            videos,
            logos: [] as LiveQueueSideAd[],
        };
    }

    return {
        mode: "LOGO" as const,
        video: null,
        videos: [] as LiveQueueSideAd[],
        logos: activeAds.filter((ad) => ad.type === "LOGO"),
    };
}

export function buildScrollingLogoSequence(logos: LiveQueueSideAd[]) {
    if (logos.length === 0) {
        return [];
    }

    const minimumSequenceLength = Math.max(logos.length * 2, 8);
    const repeatedLogos: LiveQueueSideAd[] = [];

    while (repeatedLogos.length < minimumSequenceLength) {
        repeatedLogos.push(...logos);
    }

    return repeatedLogos;
}
