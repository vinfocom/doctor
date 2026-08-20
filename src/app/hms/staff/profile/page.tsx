import { redirect } from "next/navigation";
import HmsProfileView from "@/components/hms/HmsProfileView";
import { getHmsSession } from "@/lib/hms-auth";

export default async function HmsStaffProfilePage() {
    const session = await getHmsSession();
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        redirect("/hms");
    }

    return <HmsProfileView context={session.hospitalContext} />;
}
