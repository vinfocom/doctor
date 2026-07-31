export const NAH_HOSPITAL_GROUP_CODE = "NAH";
export const NAH_REGISTRATION_HOSPITAL_CODE = "nah";
export const NAH_REGISTRATION_HOSPITAL_NAME = "Nirmal Ashram Hospital";

export function normalizeHospitalGroupCode(value: string | null | undefined) {
    return String(value || "").trim().toUpperCase();
}

export function isNahHospitalGroupCode(value: string | null | undefined) {
    return normalizeHospitalGroupCode(value) === NAH_HOSPITAL_GROUP_CODE;
}

export function getQrHospitalCode(hospitalGroupCode: string | null | undefined) {
    const normalized = normalizeHospitalGroupCode(hospitalGroupCode);
    if (!normalized) return "";
    if (normalized === NAH_HOSPITAL_GROUP_CODE) {
        return NAH_REGISTRATION_HOSPITAL_CODE;
    }
    return normalized;
}

export function getQrHospitalName(
    hospitalGroupCode: string | null | undefined,
    fallbackName?: string | null
) {
    if (isNahHospitalGroupCode(hospitalGroupCode)) {
        return NAH_REGISTRATION_HOSPITAL_NAME;
    }
    return String(fallbackName || "").trim();
}
