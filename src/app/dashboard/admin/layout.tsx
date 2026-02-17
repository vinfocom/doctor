
import { getSession } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import { redirect } from "next/navigation";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
        redirect("/login");
    }

    return (
        <div className="dashboard-layout">
            <DashboardSidebar role={session.role} userName={session.email.split('@')[0] || "Admin"} />
            <div className="dashboard-main">
                {children}
            </div>
        </div>
    );
}
