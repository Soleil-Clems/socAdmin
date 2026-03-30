import { create } from "zustand";

type DbType = "mysql" | "postgresql" | "mongodb";

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
  isConnected: false,
  host: "",
  port: 0,
  user: "",
  dbType: "",
  setConnected: (host, port, user, dbType) =>
    set({ isConnected: true, host, port, user, dbType }),
  disconnect: () =>
    set({ isConnected: false, host: "", port: 0, user: "", dbType: "" }),
}));
