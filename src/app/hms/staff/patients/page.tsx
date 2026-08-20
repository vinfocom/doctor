import { redirect } from "next/navigation";
import HmsFeatureDisabled from "@/components/hms/HmsFeatureDisabled";
import { getHmsSession, getHmsStaffProfile } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import HmsReceptionDashboardClient from "../HmsReceptionDashboardClient";

export default async function HmsStaffPatientsPage() {
    const session = await getHmsSession();
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        redirect("/hms");
    }

    const staff = await getHmsStaffProfile(session.hospitalContext);
    if (staff?.staffType !== "REGISTRATION") {
        redirect("/hms");
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "reception_module"))) {
        return <HmsFeatureDisabled title="Patients" />;
    }

    return <HmsReceptionDashboardClient mode="patients" />;
}
