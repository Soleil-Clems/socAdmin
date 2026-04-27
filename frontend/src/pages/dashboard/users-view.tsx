// @soleil-clems: Dashboard - SGBD users management
import { useState } from "react";
import { useUsers } from "@/hooks/queries/use-users";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
import { useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";

type QueryResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
};

const MONGO_BUILTIN_ROLES = [
  "read", "readWrite", "dbAdmin", "dbOwner", "userAdmin",
  "clusterAdmin", "clusterManager", "clusterMonitor",
  "backup", "restore", "readAnyDatabase", "readWriteAnyDatabase",
  "userAdminAnyDatabase", "dbAdminAnyDatabase", "root",
];

export default function UsersView() {
  const { data, isLoading, isError, error } = useUsers();
  const result = data as QueryResult | undefined;
  const isMongo = useConnectionStore((s) => s.dbType) === "mongodb";
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", database: "admin" });
  const [newRoles, setNewRoles] = useState([{ role: "readWrite", db: "" }]);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [dropError, setDropError] = useState("");

  // Edit Roles dialog
  const [editingUser, setEditingUser] = useState<{ username: string; database: string } | null>(null);
  const [editRoles, setEditRoles] = useState<{ role: string; db: string }[]>([]);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const openEditRoles = (username: string, database: string, rawRoles: unknown) => {
    setEditError("");
    let parsed: { role: string; db: string }[] = [];
    if (typeof rawRoles === "string" && rawRoles.trim()) {
      // "role@db, role@db" or "role,role"
      parsed = rawRoles.split(",").map((s) => s.trim()).filter(Boolean).map((tok) => {
        const [r, d] = tok.split("@");
        return { role: r?.trim() || "read", db: d?.trim() || database };
      });
    }
    if (parsed.length === 0) parsed = [{ role: "read", db: database }];
    setEditingUser({ username, database });
    setEditRoles(parsed);
  };

  const handleSaveRoles = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    setEditError("");
    try {
      const roles = editRoles.filter((r) => r.role).map((r) => ({ role: r.role, db: r.db || editingUser.database }));
      await databaseRequest.mongoUpdateUserRoles(editingUser.username, editingUser.database, roles);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newUser.username || !newUser.password) {
      setCreateError("Username and password are required");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const roles = newRoles
        .filter((r) => r.role)
        .map((r) => ({ role: r.role, db: r.db || newUser.database }));
      await databaseRequest.mongoCreateUser(newUser.username, newUser.password, newUser.database, roles);
      setShowCreate(false);
      setNewUser({ username: "", password: "", database: "admin" });
      setNewRoles([{ role: "readWrite", db: "" }]);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDrop = async (username: string, database: string) => {
    if (!await confirm({ title: "Drop user", message: `Drop user "${username}" from ${database}?`, confirmLabel: "Drop", variant: "destructive" })) return;
    setDropError("");
    try {
      await databaseRequest.mongoDropUser(username, database);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      setDropError((e as Error).message);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">User Accounts</span>
        {result?.Rows && (
          <span className="text-muted-foreground">{result.Rows.length} users</span>
        )}
        {isMongo && isAdmin && (
          <Button
            size="sm"
            className="h-7 text-xs px-3 ml-auto"
            onClick={() => setShowCreate(true)}
          >
            + User
          </Button>
        )}
      </div>

      {dropError && (
        <div className="mx-3 mt-2 px-3 py-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded">
          {dropError}
        </div>
      )}

      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <table className="w-full data-table">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                {result?.Columns?.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
                {isMongo && isAdmin && (
                  <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-28">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {result?.Rows?.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-accent/40 transition-colors"
                >
                  {result.Columns.map((col) => (
                    <td key={col} className="px-3 py-1.5 text-[13px]">
                      {row[col] === null ? (
                        <span className="text-muted-foreground/50 italic text-[11px]">NULL</span>
                      ) : (
                        String(row[col])
                      )}
                    </td>
                  ))}
                  {isMongo && isAdmin && (
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEditRoles(String(row["User"]), String(row["Database"]), row["Roles"])}
                        className="px-1.5 py-0.5 text-[11px] text-foreground hover:bg-accent rounded transition-colors mr-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDrop(String(row["User"]), String(row["Database"]))}
                        className="px-1.5 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors"
                      >
                        Drop
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {(!result?.Rows || result.Rows.length === 0) && (
                <tr>
                  <td
                    colSpan={(result?.Columns?.length ?? 1) + (isMongo && isAdmin ? 1 : 0)}
                    className="text-center text-muted-foreground py-12 text-sm"
                  >
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {/* Create MongoDB user dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Create MongoDB User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Username</label>
              <Input
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                placeholder="username"
                className="h-8 text-xs"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Password</label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="password"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Auth Database</label>
              <Input
                value={newUser.database}
                onChange={(e) => setNewUser({ ...newUser, database: e.target.value })}
                placeholder="admin"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Roles</label>
              {newRoles.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={r.role}
                    onChange={(e) => {
                      const next = [...newRoles];
                      next[i] = { ...next[i], role: e.target.value };
                      setNewRoles(next);
                    }}
                    className="h-8 flex-1 text-xs bg-background border border-border rounded px-2"
                  >
                    {MONGO_BUILTIN_ROLES.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <Input
                    value={r.db}
                    onChange={(e) => {
                      const next = [...newRoles];
                      next[i] = { ...next[i], db: e.target.value };
                      setNewRoles(next);
                    }}
                    placeholder="db (default: auth db)"
                    className="h-8 w-32 text-xs"
                  />
                  <button
                    onClick={() => setNewRoles(newRoles.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive text-sm w-6"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => setNewRoles([...newRoles, { role: "read", db: "" }])}
                className="text-[11px] text-primary hover:underline"
              >
                + Add role
              </button>
            </div>

            {createError && <p className="text-xs text-destructive">{createError}</p>}

            <Button className="w-full h-8" onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit roles dialog */}
      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Edit Roles · {editingUser?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Auth database: <span className="font-mono">{editingUser?.database}</span>
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Roles</label>
              {editRoles.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={r.role}
                    onChange={(e) => {
                      const next = [...editRoles];
                      next[i] = { ...next[i], role: e.target.value };
                      setEditRoles(next);
                    }}
                    className="h-8 flex-1 text-xs bg-background border border-border rounded px-2"
                  >
                    {MONGO_BUILTIN_ROLES.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <Input
                    value={r.db}
                    onChange={(e) => {
                      const next = [...editRoles];
                      next[i] = { ...next[i], db: e.target.value };
                      setEditRoles(next);
                    }}
                    placeholder="db"
                    className="h-8 w-32 text-xs"
                  />
                  <button
                    onClick={() => setEditRoles(editRoles.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive text-sm w-6"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => setEditRoles([...editRoles, { role: "read", db: editingUser?.database || "" }])}
                className="text-[11px] text-primary hover:underline"
              >
                + Add role
              </button>
            </div>

            {editError && <p className="text-xs text-destructive">{editError}</p>}

            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1 h-8" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button className="flex-1 h-8" onClick={handleSaveRoles} disabled={editSaving}>
                {editSaving ? "Saving..." : "Save Roles"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
