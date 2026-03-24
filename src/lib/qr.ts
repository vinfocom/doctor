const QR_PREVIEW_ENDPOINT = "https://msgbot.duckdns.org/qr/generate";
const QR_DOWNLOAD_ENDPOINT = "https://msgbot.duckdns.org/qr/generate/download";

type PreviewPayload = {
    doctor_id: number;
    clinic_id: number;
};

const CANDIDATE_KEYS = [
    "dataUrl",
    "data_url",
    "preview_data_url",
    "image",
    "imageUrl",
    "image_url",
    "qr",
    "qrCode",
    "qr_code",
    "url",
] as const;

function toDataUrl(contentType: string, buffer: Buffer) {
    return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function isProbablyBase64(value: string) {
    const normalized = value.replace(/\s+/g, "");
    return normalized.length > 100 && /^[A-Za-z0-9+/=]+$/.test(normalized);
}

function extractCandidate(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value !== "object") return null;

    for (const key of CANDIDATE_KEYS) {
        const candidate = (value as Record<string, unknown>)[key];
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }

    for (const nested of Object.values(value as Record<string, unknown>)) {
        const candidate = extractCandidate(nested);
        if (candidate) return candidate;
    }

    return null;
}

async function resolveCandidateToDataUrl(candidate: string) {
    if (candidate.startsWith("data:image/")) {
        return candidate;
    }

    if (/^https?:\/\//i.test(candidate)) {
        const assetResponse = await fetch(candidate, { cache: "no-store" });
        if (!assetResponse.ok) {
            throw new Error("Failed to fetch QR image");
        }

        const contentType = assetResponse.headers.get("content-type") || "image/png";
        const buffer = Buffer.from(await assetResponse.arrayBuffer());
        return toDataUrl(contentType, buffer);
    }

    if (isProbablyBase64(candidate)) {
        return `data:image/png;base64,${candidate.replace(/\s+/g, "")}`;
    }

    return null;
}

export function getQrDownloadUrl(doctorId: number, clinicId: number) {
    const params = new URLSearchParams({
        doctor_id: String(doctorId),
        clinic_id: String(clinicId),
    });

    return `${QR_DOWNLOAD_ENDPOINT}?${params.toString()}`;
}

export async function getQrPreviewDataUrl(payload: PreviewPayload) {
    const response = await fetch(QR_PREVIEW_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json, image/*",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`QR preview request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";

    if (contentType.startsWith("image/")) {
        const buffer = Buffer.from(await response.arrayBuffer());
        return toDataUrl(contentType, buffer);
    }

    const data = await response.json();
    const candidate = extractCandidate(data);

    if (!candidate) {
        throw new Error("QR preview response did not include an image");
    }

    const resolved = await resolveCandidateToDataUrl(candidate);
    if (!resolved) {
        throw new Error("QR preview response format is unsupported");
    }

    return resolved;
}

export function parseQrDataUrl(dataUrl: string) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        throw new Error("Unsupported QR data URL format");
    }

    const [, contentType, base64Payload] = match;
    return {
        contentType,
        buffer: Buffer.from(base64Payload, "base64"),
    };
}

export function getQrFileExtension(contentType: string) {
    if (contentType === "image/svg+xml") return "svg";
    if (contentType === "image/png") return "png";
    if (contentType === "image/jpeg") return "jpg";
    if (contentType === "image/webp") return "webp";
    return "bin";
}
