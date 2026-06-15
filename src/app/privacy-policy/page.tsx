import type { Metadata } from "next";
import { LEGAL_CONTACT_EMAILS, PRIVACY_POLICY_LAST_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | Dapto",
  description: "Privacy Policy for the Dapto mobile and web application.",
};

const CONTACT_EMAIL = LEGAL_CONTACT_EMAILS[0];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white p-6 md:p-10">
        <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-600">Last Updated: {PRIVACY_POLICY_LAST_UPDATED}</p>
        <p className="mt-6 text-gray-700 leading-7">
          This Privacy Policy describes how Dapto (“we”, “us”, or “our”), operated by an independent development team led by Kanika, collects, uses, discloses, and safeguards your information when you use the Dapto mobile application and related services.
        </p>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">1. Information We Collect</h2>
          <ul className="list-disc space-y-2 pl-6 text-gray-700 leading-7">
            <li>
              Account and profile data, such as name, email, role, phone number, clinic details,
              and professional profile information.
            </li>
            <li>
              Patient and appointment data, such as patient name, phone number, gender, age,
              booking details, appointment date/time, and status.
            </li>
            <li>
              Communication data, such as in-app chat messages, announcements, and related
              metadata (timestamps, sender role, read status).
            </li>
            <li>
              Uploaded files, such as profile images, clinic barcode images, documents, and chat
              attachments.
            </li>
            <li>
              Notification data, such as push notification tokens used to send notification alerts.
            </li>
            <li>
              Authentication/session data, such as hashed passwords (for applicable accounts),
              phone-based identifiers, and login/session tokens.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">2. Device Permissions We Use</h2>
          <ul className="list-disc space-y-2 pl-6 text-gray-700 leading-7">
            <li>
              Camera: to capture images for chat, when you choose.
            </li>
            <li>Photos/Media Library: to select and upload files or images from your device.</li>
            <li>
              Notifications: to send appointment updates, announcements, and chat alerts (when
              enabled by you).
            </li>
            <li>
              Storage/Files access (where applicable): to export and save generated files such as
              appointment reports.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">3. How We Use Information</h2>
          <ul className="list-disc space-y-2 pl-6 text-gray-700 leading-7">
            <li>To create and manage user accounts and provide secure access to the app.</li>
            <li>To schedule, manage, and track appointments and clinic workflows.</li>
            <li>To enable real-time communication between doctors and patients.</li>
            <li>To send chat notifications and announcements.</li>
            <li>To store and retrieve uploaded files required for app functionality.</li>
            <li>To maintain service reliability, security, and fraud/abuse prevention.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">
            4. Legal Basis and Necessity of Processing
          </h2>
          <p className="text-gray-700 leading-7">
            We process personal data on applicable legal bases, including service delivery needs,
            legitimate interests, legal obligations, and consent where required by law.
          </p>
          <p className="text-gray-700 leading-7">
            We use personal data only when necessary for core app functions such as login,
            appointment management, communication, notifications, and support.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">5. How Information Is Shared</h2>
          <p className="text-gray-700 leading-7">
            We do not sell personal information. We may share information only in the following
            cases:
          </p>
          <ul className="list-disc space-y-2 pl-6 text-gray-700 leading-7">
            <li>
              Service providers and infrastructure partners that process data on our behalf (for
              example, cloud storage and push notification delivery).
            </li>
            <li>
              Within your authorized organization/workflow, such as doctor, patient, clinic staff,
              and admin access controls.
            </li>
            <li>When required by law, regulation, legal process, or to protect rights/safety.</li>
            <li>
              In connection with a merger, acquisition, restructuring, or business transfer, with
              appropriate safeguards.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">6. Data Retention</h2>
          <p className="text-gray-700 leading-7">
            We retain information for as long as needed to provide services, comply with legal
            obligations, resolve disputes, and enforce agreements. Retention periods may vary based
            on data type and operational/legal requirements.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">7. Data Security and Confidentiality</h2>
          <p className="text-gray-700 leading-7">
            {/* We use reasonable technical and organizational measures to help protect personal
            information against unauthorized access, loss, misuse, or alteration. */}
            We implement reasonable technical and organizational measures to protect personal information against unauthorized access, loss, misuse, or alteration.
          </p>
          <p className="text-gray-700 leading-7">
            Sensitive data is handled as confidential information and protected with encryption and
            access controls where applicable.
          </p>
          <p className="text-gray-700 leading-7">
            We use cloud infrastructure with security controls to protect data in transit and at
            rest, as configured.
          </p>
          <p className="text-gray-700 leading-7">
            {/* No system is 100% secure, and we cannot guarantee absolute security. */}
            {/* While we take all reasonable measures to protect your data and ensure its security, there may be inherent system vulnerabilities or unforeseen gaps that could result in unauthorized access or data breaches. */}
            {/* While we take all reasonable steps to protect your data, no method of transmission or storage is completely secure. There may be inherent system vulnerabilities or unforeseen gaps that could result in unauthorized access or data breaches. */}
            While we implement reasonable and industry-standard security measures to protect your data, no method of transmission or storage is completely secure. We cannot guarantee absolute security of your information, and there may be unforeseen vulnerabilities that could result in unauthorized access, disclosure, or data breaches. We shall not be held liable for any loss or damage arising from such incidents beyond our reasonable control.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">8. Your Choices and Rights</h2>
          <p className="text-gray-700 leading-7">
            You may have rights to access, correct, delete, or object to certain processing of
            your personal information.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">9. Changes to This Policy</h2>
          <p className="text-gray-700 leading-7">
            We may update this Privacy Policy from time to time. The updated version will be posted
            on this page with a revised Last Updated date.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">10. Contact Us</h2>
          <p className="text-gray-700 leading-7">
            If you have any privacy questions or requests, contact us at{" "}
            <a className="font-medium text-indigo-600 hover:text-indigo-700" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
