import type { EmrMasterType } from "@/lib/emr";

const ROUTE_KIND_TO_MASTER_TYPE: Record<string, EmrMasterType> = {
  medicines: "medicine",
  complaints: "complaint",
  diagnosis: "diagnosis",
  tests: "test",
  advice: "advice",
};

export function resolveMasterKind(kind: string): EmrMasterType | null {
  return ROUTE_KIND_TO_MASTER_TYPE[kind] ?? null;
}
