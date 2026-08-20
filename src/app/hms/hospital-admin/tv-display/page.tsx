import { redirect } from "next/navigation";
import HmsFeatureDisabled from "@/components/hms/HmsFeatureDisabled";
import { getHmsSession } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import HmsTvAccountsClient from "./HmsTvAccountsClient";

export default async function HospitalAdminTvDisplayPage() {
    const session = await getHmsSession();
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        redirect("/hms");
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "tv_display_module"))) {
        return <HmsFeatureDisabled title="TV Display" />;
    }

    return <HmsTvAccountsClient />;
}
