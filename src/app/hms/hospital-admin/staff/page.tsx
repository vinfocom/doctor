import { redirect } from "next/navigation";
import { getHmsSession } from "@/lib/hms-auth";
import HmsStaffClient from "./HmsStaffClient";

export default async function HospitalAdminStaffPage() {
    const session = await getHmsSession();

    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        redirect("/hms");
    }

    return <HmsStaffClient />;
}
