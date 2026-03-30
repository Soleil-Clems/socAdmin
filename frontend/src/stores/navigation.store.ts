import { create } from "zustand";

function getParamsFromURL() {
  const params = new URLSearchParams(window.location.search);
  return {
    db: params.get("db") || "",
    table: params.get("table") || "",
  };
}

function syncURL(db: string, table: string) {
  const params = new URLSearchParams();
  if (db) params.set("db", db);
  if (table) params.set("table", table);
  const qs = params.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}

type NavigationState = {
  selectedDb: string;
  selectedTable: string;
  setSelectedDb: (db: string) => void;
  setSelectedTable: (table: string) => void;
};

const initial = getParamsFromURL();

export const useNavigationStore = create<NavigationState>((set) => ({
  selectedDb: initial.db,
  selectedTable: initial.table,
  setSelectedDb: (db) => {
    syncURL(db, "");
    set({ selectedDb: db, selectedTable: "" });
  },
  setSelectedTable: (table) => {
    set((state) => {
      syncURL(state.selectedDb, table);
      return { selectedTable: table };
    });
  },
}));
