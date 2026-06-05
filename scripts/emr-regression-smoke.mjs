import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function readFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertExists(relativePath, message) {
  const fullPath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`${message} Missing: ${relativePath}`);
  }
}

function assertIncludes(relativePath, needle, message) {
  const content = readFile(relativePath);
  if (!content.includes(needle)) {
    throw new Error(`${message} Missing "${needle}" in ${relativePath}`);
  }
}

function runCheck(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

console.log("Running EMR regression smoke checks...");

runCheck("Legacy image prescription module still exists", () => {
  assertExists(
    "src/components/DoctorPrescriptionModal.tsx",
    "Legacy image prescription modal should remain untouched."
  );
  assertExists(
    "src/app/api/prescriptions/route.ts",
    "Legacy image prescription API should remain untouched."
  );
  assertExists(
    "src/lib/prescriptions.ts",
    "Legacy image prescription service should remain untouched."
  );
});

runCheck("Admin EMR toggle wiring exists", () => {
  assertIncludes(
    "src/app/dashboard/admin/doctors/page.tsx",
    "EMR Prescription Pad",
    "Admin doctor page should expose EMR toggle UI."
  );
  assertIncludes(
    "src/app/api/doctors/route.ts",
    "emr_prescription_enabled",
    "Doctors API should expose EMR enable/disable state."
  );
});

runCheck("Doctor appointment View Pad entry exists", () => {
  assertIncludes(
    "src/app/dashboard/doctor/appointments/page.tsx",
    "View Pad",
    "Appointments page should show View Pad entry."
  );
  assertExists(
    "src/app/dashboard/doctor/appointments/[appointmentId]/pad/page.tsx",
    "Dedicated EMR pad page should exist."
  );
});

runCheck("Draft and finalize EMR routes exist", () => {
  assertExists(
    "src/app/api/emr/appointments/[appointmentId]/draft/route.ts",
    "Draft route should exist."
  );
  assertExists(
    "src/app/api/emr/appointments/[appointmentId]/finalize/route.ts",
    "Finalize route should exist."
  );
  assertExists(
    "src/app/api/emr/appointments/[appointmentId]/history/route.ts",
    "History route should exist."
  );
  assertExists(
    "src/app/api/emr/appointments/[appointmentId]/copy-previous/route.ts",
    "Copy previous route should exist."
  );
  assertExists(
    "src/app/api/emr/appointments/[appointmentId]/revisions/route.ts",
    "Revision route should exist."
  );
});

runCheck("Suggestions and master APIs exist", () => {
  assertExists(
    "src/app/api/suggestions/[kind]/route.ts",
    "Suggestions route should exist."
  );
  assertExists(
    "src/app/api/emr/master/[kind]/route.ts",
    "Add-master route should exist."
  );
  assertExists(
    "src/app/api/emr/master/[kind]/[id]/status/route.ts",
    "Master review route should exist."
  );
});

runCheck("Layout settings and print view exist", () => {
  assertExists(
    "src/app/api/emr/layout-settings/route.ts",
    "Layout settings API should exist."
  );
  assertExists(
    "src/app/dashboard/doctor/emr-layout/page.tsx",
    "Doctor layout settings page should exist."
  );
  assertExists(
    "src/app/dashboard/doctor/prescriptions/[prescriptionId]/print/page.tsx",
    "Dedicated final print view should exist."
  );
});

runCheck("Patient-safe finalized prescription routes exist", () => {
  assertExists(
    "src/app/api/patient/prescriptions/route.ts",
    "Patient prescriptions list route should exist."
  );
  assertExists(
    "src/app/api/patient/prescriptions/[prescriptionId]/route.ts",
    "Patient prescription detail route should exist."
  );
});

runCheck("EMR hardening utilities exist", () => {
  assertExists(
    "src/lib/emr/rateLimit.ts",
    "Rate limit utility should exist."
  );
  assertExists(
    "src/lib/emr/ops.ts",
    "Operational logging utility should exist."
  );
});

if (process.exitCode && process.exitCode !== 0) {
  console.error("EMR regression smoke checks failed.");
  process.exit(process.exitCode);
}

console.log("All EMR regression smoke checks passed.");
