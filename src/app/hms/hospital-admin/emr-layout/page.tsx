import HmsFeatureDisabled from "@/components/hms/HmsFeatureDisabled";
import HmsFullEmrLayoutSettings from "@/components/hms/HmsFullEmrLayoutSettings";
import { getHmsSession } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

export default async function HospitalAdminEmrLayoutPage() {
    const session = await getHmsSession();

    if (!session || !(await isHmsFeatureEnabled(session.hospitalContext, "emr_module"))) {
        return <HmsFeatureDisabled title="EMR Layout" />;
    }

    return (
        <HmsFullEmrLayoutSettings
            listEndpoint="/api/hms/hospital-admin/emr-layouts"
            settingsEndpoint="/api/hms/hospital-admin/emr-layout-settings"
            title="EMR Layout"
            subtitle="Full EMR layout settings for HMS doctors and reception header print."
        />
    );
}
