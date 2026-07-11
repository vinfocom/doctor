import { getPrintableComplaintEntries } from "@/lib/emr/complaintFormatting";
import type { EmrComplaintPayload } from "@/lib/emr/types";

type PrintableComplaintGridProps = {
  complaints: EmrComplaintPayload[];
  className?: string;
  itemClassName?: string;
  density?: "normal" | "compact";
};

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function PrintableComplaintGrid({
  complaints,
  className,
  itemClassName,
  density = "normal",
}: PrintableComplaintGridProps) {
  const entries = getPrintableComplaintEntries(complaints);
  if (entries.length === 0) return null;

  return (
    <div
      className={joinClasses(
        density === "compact"
          ? "grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 print:grid-cols-2 print:gap-x-2 print:gap-y-0.5"
          : "grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 print:grid-cols-2 print:gap-x-3 print:gap-y-1",
        className
      )}
    >
      {entries.map((entry, index) => (
        <p
          key={`${entry.name}-${index}`}
          className={joinClasses(
            density === "compact"
              ? "break-words text-sm leading-4 text-gray-700 print:text-[11px] print:leading-[0.95rem]"
              : "break-words text-sm leading-[1.1rem] text-gray-700 print:text-[12px] print:leading-4",
            itemClassName
          )}
        >
          <span className="font-semibold text-gray-900">{entry.name}</span>
          {entry.detailText ? <span>{` - ${entry.detailText}`}</span> : null}
        </p>
      ))}
    </div>
  );
}
