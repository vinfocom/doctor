"use client";

import { useEffect } from "react";

export function useHmsAutoDismissMessage(message: string, onDismiss: () => void, delayMs = 5500) {
    useEffect(() => {
        if (!message) return;

        const timer = window.setTimeout(onDismiss, delayMs);
        return () => window.clearTimeout(timer);
    }, [delayMs, message, onDismiss]);
}
