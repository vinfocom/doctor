import { redirect } from "next/navigation";
import HmsFeatureDisabled from "@/components/hms/HmsFeatureDisabled";
import { getHmsSession } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import HmsHospitalAdsClient from "./HmsHospitalAdsClient";

export default async function HospitalAdminAdsPage() {
    const session = await getHmsSession();
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        redirect("/hms");
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "ads_module"))) {
        return <HmsFeatureDisabled title="Ads" />;
    }

    return <HmsHospitalAdsClient />;
}
