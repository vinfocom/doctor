"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

type HmsInfoHintProps = {
    text: string;
};

export function HmsInfoHint({ text }: HmsInfoHintProps) {
    const tooltipId = useId();
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    const showTooltip = (target: HTMLElement) => {
        const rect = target.getBoundingClientRect();
        const tooltipWidth = 256;
        const viewportPadding = 12;
        const left = Math.min(
            Math.max(rect.left + rect.width / 2, viewportPadding + tooltipWidth / 2),
            window.innerWidth - viewportPadding - tooltipWidth / 2
        );

        setPosition({
            top: rect.bottom + 8,
            left,
        });
    };

    const hideTooltip = () => {
        setPosition(null);
    };

    return (
        <>
            <span
                className="inline-flex items-center align-middle"
                tabIndex={0}
                aria-describedby={position ? tooltipId : undefined}
                onMouseEnter={(event) => showTooltip(event.currentTarget)}
                onMouseLeave={hideTooltip}
                onFocus={(event) => showTooltip(event.currentTarget)}
                onBlur={hideTooltip}
            >
                <Info size={14} className="shrink-0 text-gray-400 transition-colors hover:text-gray-700" aria-hidden="true" />
            </span>
            {position
                ? createPortal(
                    <span
                        id={tooltipId}
                        role="tooltip"
                        className="pointer-events-none fixed z-[9999] w-64 -translate-x-1/2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-xs font-normal leading-relaxed text-gray-700 shadow-lg"
                        style={{ top: position.top, left: position.left }}
                    >
                        {text}
                    </span>,
                    document.body
                )
                : null}
        </>
    );
}

export function HmsLabelWithInfo({ label, info }: { label: string; info?: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span>{label}</span>
            {info ? <HmsInfoHint text={info} /> : null}
        </span>
    );
}
