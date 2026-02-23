
import { getSession } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import { redirect } from "next/navigation";

export default async function DoctorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session || session.role !== "DOCTOR") {
        redirect("/login");
    }
    const userName = session.email?.split("@")[0] || "Doctor";

    return (
        <div className="dashboard-layout">
            <DashboardSidebar role={session.role} userName={userName} />
            <div className="dashboard-main">
                {children}
            </div>
        </div>
    );
}
