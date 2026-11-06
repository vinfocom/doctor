async function loadNodeMailer() {
  const dynamicImport = new Function("specifier", "return import(specifier);") as (
    specifier: string
  ) => Promise<{
    default?: {
      createTransport: (options: unknown) => {
        sendMail: (options: unknown) => Promise<{ messageId?: string | null }>;
      };
    };
  }>;

  const mod = await dynamicImport("nodemailer");
  if (!mod.default?.createTransport) throw new Error("nodemailer is not available");
  return mod.default;
}

export async function sendAccountDeletionRequestEmail(input: {
  requestId: number;
  userId: number;
  role: string;
  phone: string | null;
  requestedAt: Date;
  email: string | null;
  reason: string | null;
  details: {
    name: string | null;
    patientId: number | null;
    uhid: string | null;
    doctorId: number | null;
    doctorName: string | null;
    clinicStaffId: number | null;
    clinicId: number | null;
    associatedClinicIds: number[];
    clinicName: string | null;
    adminId: number | null;
    staffRole: string | null;
    specialization: string | null;
  };
}) {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number.parseInt(String(process.env.SMTP_PORT || "587"), 10) || 587;
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from = String(process.env.SMTP_FROM || "").trim() || "DAPTO Support <vinfocomservices@gmail.com>";
  if (!host || !user || !pass) throw new Error("Missing SMTP configuration");

  const nodemailer = await loadNodeMailer();
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  const details = input.details;
  return transport.sendMail({
    from,
    to: "dapptosupport@gmail.com",
    subject: `Dapto account deletion request #${input.requestId}`,
    text: [
      "INTERNAL DAPTO SUPPORT NOTICE. This message is sent only to Dapto Support; it is not returned to or displayed in the user's app.",
      "The requester verified their password in the app. No account has been deleted or deactivated automatically.",
      "",
      "REQUEST",
      `Request ID: ${input.requestId}`,
      "Request status: pending",
      `Requested at (UTC): ${input.requestedAt.toISOString()}`,
      `User-selected reason: ${input.reason || "Not provided"}`,
      "",
      "ACCOUNT IDENTIFIERS",
      `User ID: ${input.userId}`,
      `Role: ${input.role}`,
      `Patient ID: ${details.patientId ?? "Not applicable"}`,
      `Doctor ID: ${details.doctorId ?? "Not applicable"}`,
      `Clinic staff ID: ${details.clinicStaffId ?? "Not applicable"}`,
      `Clinic ID: ${details.clinicId ?? "Not applicable"}`,
      `Associated clinic IDs: ${details.associatedClinicIds.length ? details.associatedClinicIds.join(", ") : "None found"}`,
      `Admin ID: ${details.adminId ?? "Not available"}`,
      `Patient UHID: ${details.uhid || "Not applicable"}`,
      "",
      "ACCOUNT DETAILS",
      `Name: ${details.name || details.doctorName || "Not available"}`,
      `Doctor name: ${details.doctorName || "Not applicable"}`,
      `Email: ${input.email || "Not provided"}`,
      `Phone: ${input.phone || "Not provided"}`,
      `Clinic name: ${details.clinicName || "Not available"}`,
      `Staff role: ${details.staffRole || "Not applicable"}`,
      `Specialization: ${details.specialization || "Not available"}`,
      "",
      "PROCESSING CHECKLIST",
      "1. Use the role and IDs above to locate the correct account and related records.",
      "2. Review applicable legal and healthcare record-retention requirements before removing any data.",
      "3. Process the deletion manually using the approved Dapto procedure; this request does not delete or deactivate anything.",
      "4. After processing is complete, update this request's status from pending to completed.",
    ].join("\n"),
  });
}
