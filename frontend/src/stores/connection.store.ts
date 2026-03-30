import { create } from "zustand";

type ConnectionState = {
  isConnected: boolean;
  host: string;
  port: number;
  user: string;
  setConnected: (host: string, port: number, user: string) => void;
  disconnect: () => void;
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  host: "",
  port: 0,
  user: "",
  setConnected: (host, port, user) =>
    set({ isConnected: true, host, port, user }),
  disconnect: () =>
    set({ isConnected: false, host: "", port: 0, user: "" }),
}));
