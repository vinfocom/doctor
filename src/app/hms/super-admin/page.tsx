import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import HmsSuperAdminClient from "./HmsSuperAdminClient";

export default async function HmsSuperAdminPage() {
    const session = await getSession();

    if (!session || session.role !== "SUPER_ADMIN") {
        redirect("/login");
    }

    return <HmsSuperAdminClient />;
}
