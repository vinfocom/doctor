import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import HmsSuperAdminFeatureFlagsClient from "./HmsSuperAdminFeatureFlagsClient";

export default async function HmsSuperAdminFeatureFlagsPage({
    searchParams,
}: {
    searchParams?: Promise<{ hospitalId?: string }>;
}) {
    const session = await getSession();

    if (!session || session.role !== "SUPER_ADMIN") {
        redirect("/login");
    }

    const resolvedSearchParams = await searchParams;
    const initialHospitalId = Number(resolvedSearchParams?.hospitalId || 0);

    return <HmsSuperAdminFeatureFlagsClient initialHospitalId={Number.isInteger(initialHospitalId) && initialHospitalId > 0 ? initialHospitalId : null} />;
}
