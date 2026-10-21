import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHotkeys } from "./use-hotkeys";

function fireKey(key: string, opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
}

describe("useHotkeys", () => {
  it("fires handler on matching Ctrl shortcut", () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys([{ key: "k", ctrl: true, handler }]));

    fireKey("k", { ctrlKey: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("fires handler on matching Meta (Cmd) shortcut", () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys([{ key: "k", ctrl: true, handler }]));

    fireKey("k", { metaKey: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not fire when Ctrl is not held", () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys([{ key: "k", ctrl: true, handler }]));

    fireKey("k");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not fire for wrong key", () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys([{ key: "k", ctrl: true, handler }]));

    fireKey("j", { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("fires Escape without modifier", () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys([{ key: "Escape", handler }]));

    fireKey("Escape");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("requires shift when shift is specified", () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys([{ key: "r", ctrl: true, shift: true, handler }]));

    fireKey("r", { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();

    fireKey("r", { ctrlKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("cleans up listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useHotkeys([{ key: "k", ctrl: true, handler }]));

    unmount();
    fireKey("k", { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });
});
