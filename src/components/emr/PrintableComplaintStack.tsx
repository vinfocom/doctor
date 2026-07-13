import { getPrintableComplaints } from "@/lib/emr/complaintFormatting";
import type { EmrComplaintPayload } from "@/lib/emr/types";

type PrintableComplaintStackProps = {
  complaints: EmrComplaintPayload[];
  className?: string;
  itemClassName?: string;
  density?: "normal" | "compact";
};

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function PrintableComplaintStack({
  complaints,
  className,
  itemClassName,
  density = "normal",
}: PrintableComplaintStackProps) {
  const lines = getPrintableComplaints(complaints, "single_line_stacked");
  if (lines.length === 0) return null;

  return (
    <div
      className={joinClasses(
        density === "compact"
          ? "space-y-0.5 print:space-y-0"
          : "space-y-1 print:space-y-0.5",
        className
      )}
    >
      {lines.map((line, index) => (
        <p
          key={`${line}-${index}`}
          className={joinClasses(
            density === "compact"
              ? "break-words text-sm leading-4 text-gray-700 print:text-[11px] print:leading-[0.95rem]"
              : "break-words text-sm leading-[1.1rem] text-gray-700 print:text-[12px] print:leading-4",
            itemClassName
          )}
        >
          {line}
        </p>
      ))}
    </div>
  );
}
