import { create } from "zustand";

type NavigationState = {
  selectedDb: string;
  selectedTable: string;
  setSelectedDb: (db: string) => void;
  setSelectedTable: (table: string) => void;
};

export const useNavigationStore = create<NavigationState>((set) => ({
  selectedDb: "",
  selectedTable: "",
  setSelectedDb: (db) => set({ selectedDb: db, selectedTable: "" }),
  setSelectedTable: (table) => set({ selectedTable: table }),
}));
