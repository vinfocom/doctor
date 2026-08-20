import HmsPortalLayout from "@/components/HmsPortalLayout";

export default function HmsStaffLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <HmsPortalLayout role="HOSPITAL_STAFF">{children}</HmsPortalLayout>;
}
