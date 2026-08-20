import { redirect } from "next/navigation";
import HmsFeatureDisabled from "@/components/hms/HmsFeatureDisabled";
import { getHmsSession, getHmsStaffProfile } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import HmsRegistrationsClient from "./HmsRegistrationsClient";

export default async function HmsStaffRegistrationsPage() {
    const session = await getHmsSession();
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        redirect("/hms");
    }

    const staff = await getHmsStaffProfile(session.hospitalContext);
    if (staff?.staffType !== "REGISTRATION") {
        redirect("/hms");
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "qr_temp_token_enabled"))) {
        return <HmsFeatureDisabled title="Temp Tokens" />;
    }

    return <HmsRegistrationsClient />;
}
