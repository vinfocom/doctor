import { randomBytes } from "crypto";

export const HMS_MIN_PASSWORD_LENGTH = 8;

export function generateTemporaryPassword() {
    return randomBytes(18).toString("base64url");
}

export function validateHmsPassword(value: unknown) {
    const password = String(value || "");
    if (password.length < HMS_MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${HMS_MIN_PASSWORD_LENGTH} characters.`;
    }
    return null;
}
