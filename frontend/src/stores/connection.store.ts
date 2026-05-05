// @soleil-clems: Store - DB connection state
import { create } from "zustand";

type DbType = "mysql" | "postgresql" | "mongodb";

const SESSION_KEY = "socadmin_conn";

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { host: string; port: number; user: string; dbType: DbType };
  } catch {
    return null;
  }
}

const saved = loadSession();

type ConnectionState = {
  isConnected: boolean;
  host: string;
  port: number;
  user: string;
  dbType: DbType | "";
  setConnected: (host: string, port: number, user: string, dbType: DbType) => void;
  disconnect: () => void;
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: !!saved,
  host: saved?.host || "",
  port: saved?.port || 0,
  user: saved?.user || "",
  dbType: saved?.dbType || "",
  setConnected: (host, port, user, dbType) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ host, port, user, dbType }));
    set({ isConnected: true, host, port, user, dbType });
  },
  disconnect: () => {
    sessionStorage.removeItem(SESSION_KEY);
    set({ isConnected: false, host: "", port: 0, user: "", dbType: "" });
  },
}));
