"use client";

import { useCallback, useEffect, useLayoutEffect } from "react";

export function useStableDocumentTitle(title: string) {
  const applyTitle = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.title !== title) {
      document.title = title;
    }
  }, [title]);

  useLayoutEffect(() => {
    applyTitle();
  }, [applyTitle]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    applyTitle();

    const timeouts = [0, 50, 250, 1000].map((delay) =>
      window.setTimeout(applyTitle, delay)
    );
    const interval = window.setInterval(applyTitle, 1000);

    window.addEventListener("focus", applyTitle);
    window.addEventListener("pageshow", applyTitle);
    document.addEventListener("visibilitychange", applyTitle);

    const titleNode =
      document.querySelector("title") ||
      document.head.appendChild(document.createElement("title"));
    const observer = new MutationObserver(applyTitle);
    observer.observe(titleNode, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      window.clearInterval(interval);
      window.removeEventListener("focus", applyTitle);
      window.removeEventListener("pageshow", applyTitle);
      document.removeEventListener("visibilitychange", applyTitle);
      observer.disconnect();
    };
  }, [applyTitle]);
}
