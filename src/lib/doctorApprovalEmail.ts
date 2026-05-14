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
  const nodemailer = mod?.default;
  if (!nodemailer?.createTransport) {
    throw new Error("nodemailer is not available");
  }

  return nodemailer;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const DOCTOR_APPROVAL_EMAIL_SUBJECT =
  "DAPTO - Your Doctor Account Has Been Approved";

export function buildDoctorApprovalEmailBody() {
  return `Hello,

Your doctor account on DAPTO has been verified and approved.

You can now log in using your registered email and password.

If you did not create this account, please contact support (dapptosupport@gmail.com).

Regards,
Team DAPTO`;
}

export async function sendDoctorApprovalEmail(email: string) {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = parsePositiveInt(process.env.SMTP_PORT, 587);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from =
    String(process.env.SMTP_FROM || "").trim() ||
    "DAPTO Support <vinfocomservices@gmail.com>";
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!host || !user || !pass) {
    throw new Error("Missing SMTP configuration");
  }
  if (!normalizedEmail) {
    throw new Error("A valid email is required to send approval mail");
  }

  const nodemailer = await loadNodeMailer();
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  return transport.sendMail({
    from,
    to: normalizedEmail,
    subject: DOCTOR_APPROVAL_EMAIL_SUBJECT,
    text: buildDoctorApprovalEmailBody(),
  });
}
