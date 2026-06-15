import { NextResponse } from "next/server";
import {
  LEGAL_CONTACT_EMAILS,
  TERMS_AND_CONDITIONS_CONSENT_TEXT,
  TERMS_AND_CONDITIONS_EFFECTIVE_DATE,
  TERMS_AND_CONDITIONS_PATH,
} from "@/lib/legal";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    title: "Terms & Conditions",
    effectiveDate: TERMS_AND_CONDITIONS_EFFECTIVE_DATE,
    pagePath: TERMS_AND_CONDITIONS_PATH,
    consentText: TERMS_AND_CONDITIONS_CONSENT_TEXT,
    contactEmails: [...LEGAL_CONTACT_EMAILS],
  });
}
