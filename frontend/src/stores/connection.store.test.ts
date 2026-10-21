import { describe, it, expect, beforeEach } from "vitest";
import { useConnectionStore } from "./connection.store";

describe("connection store", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useConnectionStore.setState({
      isConnected: false,
      host: "",
      port: 0,
      user: "",
      dbType: "",
    });
  });

  it("starts disconnected", () => {
    const state = useConnectionStore.getState();
    expect(state.isConnected).toBe(false);
    expect(state.host).toBe("");
    expect(state.dbType).toBe("");
  });

  it("setConnected stores connection info", () => {
    useConnectionStore.getState().setConnected("127.0.0.1", 3306, "root", "mysql");
    const state = useConnectionStore.getState();
    expect(state.isConnected).toBe(true);
    expect(state.host).toBe("127.0.0.1");
    expect(state.port).toBe(3306);
    expect(state.user).toBe("root");
    expect(state.dbType).toBe("mysql");
  });

  it("setConnected persists to sessionStorage", () => {
    useConnectionStore.getState().setConnected("localhost", 5432, "postgres", "postgresql");
    const stored = JSON.parse(sessionStorage.getItem("socadmin_conn")!);
    expect(stored.host).toBe("localhost");
    expect(stored.dbType).toBe("postgresql");
  });

  it("disconnect clears state", () => {
    useConnectionStore.getState().setConnected("127.0.0.1", 3306, "root", "mysql");
    useConnectionStore.getState().disconnect();
    const state = useConnectionStore.getState();
    expect(state.isConnected).toBe(false);
    expect(state.host).toBe("");
    expect(state.port).toBe(0);
  });

  it("disconnect removes sessionStorage entry", () => {
    useConnectionStore.getState().setConnected("127.0.0.1", 3306, "root", "mysql");
    useConnectionStore.getState().disconnect();
    expect(sessionStorage.getItem("socadmin_conn")).toBeNull();
  });
});
