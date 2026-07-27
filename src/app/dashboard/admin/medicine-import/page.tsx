import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import BulkImportPageClient from "./BulkImportPageClient";

export default async function AdminMedicineImportPage() {
  const session = await getSession();

  if (!session || session.role !== "SUPER_ADMIN") {
    redirect("/dashboard/admin");
  }

  return <BulkImportPageClient />;
}
