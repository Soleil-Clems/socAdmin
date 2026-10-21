// @soleil-clems: Hook - Backend health check with periodic polling
import { useState, useEffect, useRef, useCallback } from "react";
import { API_URL } from "@/lib/custom-fetch";

export type HealthStatus = "ok" | "down" | "reconnected";

const POLL_INTERVAL = 15;
const RECONNECTED_DISPLAY = 3_000;

export type HealthState = {
  status: HealthStatus;
  countdown: number;
  retry: () => void;
};

export function useHealthCheck(): HealthState {
  const [status, setStatus] = useState<HealthStatus>("ok");
  const [countdown, setCountdown] = useState(POLL_INTERVAL);
  const wasDown = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/health`, {
        method: "GET",
        cache: "no-store",
      });
      if (res.ok) {
        if (wasDown.current) {
          wasDown.current = false;
          setStatus("reconnected");
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setStatus("ok"), RECONNECTED_DISPLAY);
        } else {
          setStatus((prev) => (prev === "reconnected" ? prev : "ok"));
        }
      } else {
        wasDown.current = true;
        setStatus("down");
      }
    } catch {
      wasDown.current = true;
      setStatus("down");
    }
    setCountdown(POLL_INTERVAL);
  }, []);

  useEffect(() => {
    const initialId = setTimeout(check, 0);
    const pollId = setInterval(check, POLL_INTERVAL * 1000);
    const tickId = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => {
      clearTimeout(initialId);
      clearInterval(pollId);
      clearInterval(tickId);
      clearTimeout(timerRef.current);
    };
  }, [check]);

  const retry = useCallback(() => {
    setCountdown(0);
    check();
  }, [check]);

  return { status, countdown, retry };
}
