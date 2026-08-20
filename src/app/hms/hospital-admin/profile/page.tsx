import { redirect } from "next/navigation";
import HmsProfileView from "@/components/hms/HmsProfileView";
import { getHmsSession } from "@/lib/hms-auth";

export default async function HmsHospitalAdminProfilePage() {
    const session = await getHmsSession();
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        redirect("/hms");
    }

    return <HmsProfileView context={session.hospitalContext} />;
}
