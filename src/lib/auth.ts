import { cookies, headers } from "next/headers";
import { verifyToken, JWTPayload } from "./jwt";

export async function getSession(): Promise<JWTPayload | null> {
    const cookieStore = await cookies();
    let token = cookieStore.get("token")?.value;

    if (!token) {
        const headersList = await headers();
        const authHeader = headersList.get("authorization") || headersList.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

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
