// @soleil-clems: Store - Navigation state (URL sync)
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
  showAllDatabases: boolean;
  setSelectedDb: (db: string) => void;
  setSelectedTable: (table: string) => void;
  setShowAllDatabases: (show: boolean) => void;
  reset: () => void;
};

const initial = getParamsFromURL();

export const useNavigationStore = create<NavigationState>((set) => ({
  selectedDb: initial.db,
  selectedTable: initial.table,
  showAllDatabases: !initial.db,
  setSelectedDb: (db) => {
    syncURL(db, "");
    set({ selectedDb: db, selectedTable: "", showAllDatabases: false });
  },
  setSelectedTable: (table) => {
    set((state) => {
      syncURL(state.selectedDb, table);
      return { selectedTable: table, showAllDatabases: false };
    });
  },
  setShowAllDatabases: (show) => {
    if (show) {
      syncURL("", "");
      set({ showAllDatabases: true, selectedDb: "", selectedTable: "" });
    } else {
      set({ showAllDatabases: show });
    }
  },
  reset: () => {
    syncURL("", "");
    set({ selectedDb: "", selectedTable: "", showAllDatabases: true });
  },
}));
