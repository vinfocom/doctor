# EMR Phase 21 Regression Checklist

This checklist is for the doctor-side EMR Prescription Pad feature only.

## Automated smoke checks

Run from `doctor/`:

```bash
npm run test:emr-smoke
```

This verifies the EMR entry points, routes, layout settings module, print view, patient-safe APIs, and that the legacy image-based prescription module still exists separately.

## Focused static verification

Run from `doctor/`:

```bash
npx eslint \
  src/lib/emr/types.ts \
  src/lib/emr/auditService.ts \
  src/lib/emr/masterService.ts \
  src/lib/emr/prescriptionService.ts \
  src/lib/emr/printService.ts \
  src/lib/emr/patientService.ts \
  src/lib/emr/rateLimit.ts \
  src/lib/emr/ops.ts \
  src/app/api/suggestions/[kind]/route.ts \
  src/app/api/emr/master/[kind]/route.ts \
  src/app/api/emr/master/[kind]/[id]/status/route.ts \
  src/app/api/emr/appointments/[appointmentId]/draft/route.ts \
  src/app/api/emr/appointments/[appointmentId]/finalize/route.ts \
  src/app/api/emr/appointments/[appointmentId]/copy-previous/route.ts \
  src/app/api/emr/appointments/[appointmentId]/revisions/route.ts \
  src/app/api/emr/appointments/[appointmentId]/cancel/route.ts \
  src/app/api/patient/prescriptions/route.ts \
  src/app/api/patient/prescriptions/[prescriptionId]/route.ts \
  src/app/dashboard/doctor/appointments/[appointmentId]/pad/page.tsx \
  src/app/dashboard/doctor/prescriptions/[prescriptionId]/print/page.tsx
```

## Manual verification checklist

- Doctor with EMR feature OFF cannot open `View Pad`.
- Doctor with EMR feature ON can open `View Pad`.
- Existing image prescription button and modal still work unchanged.
- `doctor-mobile/` remains untouched.
- Old appointment flow still works outside EMR actions.
- Opening `View Pad` creates or resumes exactly one draft.
- Autosave updates only the current draft/prescription.
- Finalize locks the prescription into read-only mode.
- Revision creates a new version instead of overwriting the final record.
- History shows latest first and grouped by date.
- Copy Previous creates a new draft only.
- Suggestions still work if Redis is unavailable.
- Adding a duplicate master item returns the existing item without breaking flow.
- Layout settings fall back to defaults when no doctor/clinic settings exist.
- Final print view shows structured final data, not temporary local state.
- Doctor A cannot open Doctor B’s prescription context.

## High-risk regression areas

- `src/components/DoctorPrescriptionModal.tsx`
- `src/app/api/prescriptions/route.ts`
- `src/lib/prescriptions.ts`

These belong to the old image-based prescription flow and must remain separate from EMR changes.
