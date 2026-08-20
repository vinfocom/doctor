import { redirect } from "next/navigation";
import { getHmsSession } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import HmsDoctorQueueClient from "../HmsDoctorQueueClient";

export default async function HmsDoctorVisitsPage() {
    const session = await getHmsSession();

    if (!session || session.hospitalContext.role !== "DOCTOR") {
        redirect("/hms");
    }

    const printEnabled = await isHmsFeatureEnabled(session.hospitalContext, "shared_paper_print_mode");
    const emrEnabled = await isHmsFeatureEnabled(session.hospitalContext, "emr_module");

    return <HmsDoctorQueueClient defaultPrintEnabled={printEnabled} defaultEmrEnabled={emrEnabled} mode="visits" />;
}
