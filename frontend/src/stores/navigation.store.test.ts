import { describe, it, expect, beforeEach } from "vitest";
import { useNavigationStore } from "./navigation.store";

describe("navigation store", () => {
  beforeEach(() => {
    useNavigationStore.setState({
      selectedDb: "",
      selectedTable: "",
      showAllDatabases: true,
    });
  });

  it("starts with no selection", () => {
    const state = useNavigationStore.getState();
    expect(state.selectedDb).toBe("");
    expect(state.selectedTable).toBe("");
    expect(state.showAllDatabases).toBe(true);
  });

  it("setSelectedDb updates db and clears table", () => {
    useNavigationStore.getState().setSelectedDb("ecommerce");
    const state = useNavigationStore.getState();
    expect(state.selectedDb).toBe("ecommerce");
    expect(state.selectedTable).toBe("");
    expect(state.showAllDatabases).toBe(false);
  });

  it("setSelectedTable updates table", () => {
    useNavigationStore.getState().setSelectedDb("ecommerce");
    useNavigationStore.getState().setSelectedTable("users");
    const state = useNavigationStore.getState();
    expect(state.selectedDb).toBe("ecommerce");
    expect(state.selectedTable).toBe("users");
  });

  it("setShowAllDatabases(true) clears selection", () => {
    useNavigationStore.getState().setSelectedDb("mydb");
    useNavigationStore.getState().setSelectedTable("mytable");
    useNavigationStore.getState().setShowAllDatabases(true);
    const state = useNavigationStore.getState();
    expect(state.showAllDatabases).toBe(true);
    expect(state.selectedDb).toBe("");
    expect(state.selectedTable).toBe("");
  });

  it("reset clears everything", () => {
    useNavigationStore.getState().setSelectedDb("db1");
    useNavigationStore.getState().setSelectedTable("t1");
    useNavigationStore.getState().reset();
    const state = useNavigationStore.getState();
    expect(state.selectedDb).toBe("");
    expect(state.selectedTable).toBe("");
    expect(state.showAllDatabases).toBe(true);
  });
});
