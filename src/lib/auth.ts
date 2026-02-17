import { cookies } from "next/headers";
import { verifyToken, JWTPayload } from "./jwt";

export async function getSession(): Promise<JWTPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;
    return verifyToken(token);
}

export async function requireAuth(): Promise<JWTPayload> {
    const session = await getSession();
    if (!session) {
        throw new Error("Unauthorized");
    }
    return session;
}

export async function requireRole(roles: string[]): Promise<JWTPayload> {
    const session = await requireAuth();
    if (!roles.includes(session.role)) {
        throw new Error("Forbidden");
    }
    return session;
}
