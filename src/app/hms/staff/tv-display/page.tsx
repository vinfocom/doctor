import { redirect } from "next/navigation";
import HmsFeatureDisabled from "@/components/hms/HmsFeatureDisabled";
import HmsTvDisplayClient from "@/components/hms/HmsTvDisplayClient";
import { getHmsSession, getHmsStaffProfile } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

export default async function HmsStaffTvDisplayPage() {
    const session = await getHmsSession();
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        redirect("/hms");
    }

    const staff = await getHmsStaffProfile(session.hospitalContext);
    if (staff?.staffType !== "TV_DISPLAY") {
        redirect("/hms/staff");
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "tv_display_module"))) {
        return <HmsFeatureDisabled title="TV Display" />;
    }

    return <HmsTvDisplayClient compact />;
}
