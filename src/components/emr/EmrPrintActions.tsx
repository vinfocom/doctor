"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export default function EmrPrintActions({
  backHref,
  children,
}: {
  backHref: string;
  children?: ReactNode;
}) {
  return (
    <div className="print:hidden flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-gray-900">Final print view</p>
        <p className="text-xs text-gray-500">
          This page is rendered from saved final prescription data and is ready for printing or future PDF generation.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {children}
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Print Now
        </button>
        <Link
          href={backHref}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Prescription Pad
        </Link>
      </div>
    </div>
  );
}
