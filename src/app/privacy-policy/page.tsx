import type { Metadata } from "next";
import { LEGAL_CONTACT_EMAILS, PRIVACY_POLICY_LAST_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | Dapto",
  description: "Privacy Policy for the Dapto mobile and web application.",
};

const PRIMARY_CONTACT_EMAIL = LEGAL_CONTACT_EMAILS[0];
const ALL_CONTACT_EMAILS = LEGAL_CONTACT_EMAILS.join(", ");

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white p-6 md:p-10">
        <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-600">Last Updated: {PRIVACY_POLICY_LAST_UPDATED}</p>
        <p className="mt-6 text-gray-700 leading-7">
          This Privacy Policy describes how <strong>Dapto (VISPL)</strong>, operated by{" "}
          <strong>
            Vinfocom IT Services Private Limited ("VISPL", "Dapto (VISPL)", "we", "our", or "us")
          </strong>
          , collects, uses, discloses, stores, and safeguards your information when you use the
          Dapto mobile application, website, and related services.
        </p>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">1. Information We Collect</h2>
          <ul className="list-disc space-y-2 pl-6 text-gray-700 leading-7">
            <li>
              <strong>Account and profile data</strong>, including your name, email, phone number,
              role, clinic details, profile photo, qualifications, medical registration number,
              and related profile information.
            </li>
            <li>
              <strong>Patient, appointment, and healthcare data</strong>, including patient
              details, appointment information, follow-ups, live queue data, booking history, and
              related healthcare records.
            </li>
            <li>
              <strong>Electronic Medical Record (EMR) data</strong>, including complaints,
              diagnosis, medical history, examination findings, vital signs, prescriptions,
              medicines, dosage instructions, tests, advice, follow-up notes, and other clinical
              records created by authorized healthcare professionals.
            </li>
            <li>
              <strong>Communication data</strong>, including in-app messages, announcements,
              emails, SMS notifications, OTP records, and related metadata such as timestamps and
              delivery status.
            </li>
            <li>
              <strong>Uploaded files</strong>, including profile images, prescription images,
              scanned prescriptions, medical documents, reports, clinic barcode images, and chat
              attachments.
            </li>
            <li>
              <strong>Notification data</strong>, including push notification tokens used for
              reminders, alerts, and announcements.
            </li>
            <li>
              <strong>Authentication and session data</strong>, including hashed passwords,
              authentication tokens, session identifiers, verification records, and security logs.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">2. Device Permissions We Use</h2>
          <ul className="list-disc space-y-2 pl-6 text-gray-700 leading-7">
            <li>
              <strong>Camera:</strong> To capture profile photos, prescription images, medical
              documents, reports, and chat attachments when you choose.
            </li>
            <li>
              <strong>Photos/Media Library:</strong> To select and upload images, prescriptions,
              reports, documents, and other files from your device.
            </li>
            <li>
              <strong>Notifications:</strong> To send appointment updates, announcements, and chat
              alerts (when enabled by you).
            </li>
            <li>
              <strong>Storage/Files Access (where applicable):</strong> To upload, export,
              download, print, or save prescriptions, reports, and other generated files.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">3. How We Use Information</h2>
          <ul className="list-disc space-y-2 pl-6 text-gray-700 leading-7">
            <li>Create and manage user accounts and provide secure authentication.</li>
            <li>Verify user identity through email or phone-based verification where applicable.</li>
            <li>
              Schedule, manage, and track appointments, follow-up visits, live queues, and clinic
              workflows.
            </li>
            <li>
              Create, store, retrieve, view, print, download, and manage Electronic Medical
              Records (EMRs) and digital prescriptions.
            </li>
            <li>
              Enable communication between doctors, patients, clinic staff, and administrators.
            </li>
            <li>
              Send appointment reminders, OTP verification, notifications, announcements, and
              other service communications.
            </li>
            <li>
              Record medical documents, scanned prescriptions, reports, and other files required
              for services.
            </li>
            <li>
              Maintain platform security, detect fraud or misuse, troubleshoot technical issues,
              and improve service reliability.
            </li>
            <li>
              Analyze aggregated or de-identified information to improve platform functionality,
              monitor performance, develop new features, and enhance user experience where
              permitted by applicable law.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">
            4. Legal Basis and Necessity of Processing
          </h2>
          <p className="text-gray-700 leading-7">
            We process personal information where necessary to provide our Services, fulfill
            contractual obligations, comply with applicable legal obligations, protect legitimate
            interests, and obtain consent where required by applicable law.
          </p>
          <p className="text-gray-700 leading-7">
            Personal information is processed only to the extent necessary to provide healthcare
            management services, account authentication, appointment management, Electronic Medical
            Records, communication services, customer support, security, and related platform
            functionality.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">5. How Information Is Shared</h2>
          <p className="text-gray-700 leading-7">
            We do <strong>not sell</strong> your personal information for any other illegal
            activities.
          </p>
          <p className="text-gray-700 leading-7">
            We may share information only in the following circumstances:
          </p>
          <ul className="list-disc space-y-2 pl-6 text-gray-700 leading-7">
            <li>
              With service providers and infrastructure partners that help us operate the Services,
              including cloud hosting, storage, communication, email, SMS, notification delivery,
              and other technical infrastructure providers.
            </li>
            <li>
              Within your authorized healthcare workflow, including doctors, patients, clinic
              staff, and administrators, strictly in accordance with role-based access controls and
              only where necessary to provide healthcare services.
            </li>
            <li>
              When required by applicable law, legal process, court order, governmental authority,
              or to protect the rights, safety, security, or property of users or Dapto (VISPL).
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">6. Data Retention</h2>
          <p className="text-gray-700 leading-7">
            We retain personal information only for as long as necessary to provide our Services,
            comply with applicable legal obligations, resolve disputes, enforce agreements,
            maintain security, and support legitimate operational requirements.
          </p>
          <p className="text-gray-700 leading-7">
            Medical records, prescriptions, appointment records, and related healthcare
            information may be retained for periods required by applicable laws, healthcare
            regulations, professional record-keeping obligations, or legitimate operational needs.
          </p>
          <p className="text-gray-700 leading-7">
            Data may also be securely backed up for disaster recovery, business continuity, and
            system restoration purposes.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">
            7. Data Security and Confidentiality
          </h2>
          <p className="text-gray-700 leading-7">
            We implement reasonable technical, administrative, and organizational measures to
            protect personal information against unauthorized access, disclosure, alteration,
            misuse, or loss.
          </p>
          <p className="text-gray-700 leading-7">
            Sensitive healthcare information is handled as confidential information with role-based
            access controls, secure authentication mechanisms, and other appropriate safeguards.
          </p>
          <p className="text-gray-700 leading-7">
            Access to patient medical records is restricted based on user roles so that only
            authorized healthcare professionals, patients, clinic staff, and administrators can
            access information necessary for their responsibilities.
          </p>
          <p className="text-gray-700 leading-7">
            Uploaded files, including prescription images, reports, and medical documents, are
            stored using cloud infrastructure.
          </p>
          <p className="text-gray-700 leading-7">
            While we implement reasonable and industry-standard security measures, no method of
            electronic transmission or storage is completely secure. Accordingly, we cannot
            guarantee absolute security, and we shall not be liable for unauthorized access,
            disclosure, or data breaches resulting from circumstances beyond our reasonable
            control.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">8. Your Choices and Rights</h2>
          <p className="text-gray-700 leading-7">
            Subject to applicable law, you may have the right to access, correct, update, or
            request deletion of your personal information.
          </p>
          <p className="text-gray-700 leading-7">
            Account deletion requests may be submitted by contacting us using the contact
            information provided below. Upon verification, we will process such requests in
            accordance with applicable laws, operational requirements, and our data retention
            practices.
          </p>
          <p className="text-gray-700 leading-7">
            Where permitted or required by law, certain healthcare records, prescriptions,
            appointment records, audit logs, or other information may be retained for legal,
            regulatory, security, dispute resolution, or legitimate business purposes.
          </p>
          <p className="text-gray-700 leading-7">
            Parents, legal guardians, or authorized representatives may manage information
            relating to minor patients where permitted by applicable law.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">9. Changes to This Policy</h2>
          <p className="text-gray-700 leading-7">
            We may update this Privacy Policy from time to time. Any changes will become effective
            when the updated Privacy Policy is published. The "Last Updated" date at the top of
            this Privacy Policy will indicate the latest revision.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">10. Contact Us</h2>
          <p className="text-gray-700 leading-7">
            If you have any questions, concerns, or requests regarding this Privacy Policy or your
            personal information, please contact us:
          </p>
          <p className="text-gray-700 leading-7">
            <strong>Email:</strong>{" "}
            <a
              className="font-medium text-indigo-600 hover:text-indigo-700"
              href={`mailto:${PRIMARY_CONTACT_EMAIL}`}
            >
              {ALL_CONTACT_EMAILS}
            </a>
          </p>
          <p className="text-gray-700 leading-7">
            <strong>Dapto (VISPL)</strong>
            <br />
            <strong>Vinfocom IT Services Private Limited (VISPL)</strong>
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">11. Governing Law</h2>
          <p className="text-gray-700 leading-7">
            This Privacy Policy shall be governed by and construed in accordance with the laws of
            India.
          </p>
          <p className="text-gray-700 leading-7">
            Any dispute arising out of or relating to this Privacy Policy shall be subject to the
            exclusive jurisdiction of the courts located in Delhi, India.
          </p>
        </section>
      </div>
    </main>
  );
}
