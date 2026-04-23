import { getSession } from "@/lib/auth";

export async function authorizeSmsInternalApi(request: Request) {
    const internalApiKey = process.env.SMS_INTERNAL_API_KEY?.trim();
    const providedApiKey = request.headers.get("X-Internal-API-Key")?.trim();

    if (internalApiKey && providedApiKey && providedApiKey === internalApiKey) {
        return { authorized: true as const, mode: "internal_key" as const };
    }

    const session = await getSession();
    if (!session || session.role === "PATIENT") {
        return { authorized: false as const, mode: "unauthorized" as const };
    }

    return { authorized: true as const, mode: "session" as const, session };
}
