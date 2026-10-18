import { useEffect } from "react";

type HotkeyDef = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
};

export function useHotkeys(hotkeys: HotkeyDef[]) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      for (const hk of hotkeys) {
        if (hk.ctrl && !mod) continue;
        if (hk.shift && !e.shiftKey) continue;
        if (e.key.toLowerCase() !== hk.key.toLowerCase()) continue;

        // Allow Escape even in inputs
        if (hk.key === "Escape") {
          e.preventDefault();
          hk.handler();
          return;
        }

        // Skip mod shortcuts when typing in inputs (except designated ones)
        if (isInput && !hk.ctrl) continue;

        e.preventDefault();
        hk.handler();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeys]);
}
