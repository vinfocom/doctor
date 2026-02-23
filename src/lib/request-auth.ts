import { cookies } from "next/headers";
import { verifyToken, type JWTPayload } from "@/lib/jwt";

export async function getSessionFromRequest(req: Request): Promise<JWTPayload | null> {
    const cookieStore = await cookies();
    let token = cookieStore.get("token")?.value;

    if (!token) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) return null;
    return verifyToken(token);
}
