// @soleil-clems: Dashboard - roles view
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
import { databaseRequest, type MongoRoleInfo } from "@/requests/database.request";
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
import { useToast } from "@/components/ui/toast";

// Categories of MongoDB actions for the UI builder
const ACTION_CATEGORIES: { label: string; actions: string[] }[] = [
  {
    label: "Read",
    actions: ["find", "listCollections", "listIndexes", "collStats", "dbStats", "dbHash", "planCacheRead"],
  },
  {
    label: "Write",
    actions: ["insert", "update", "remove", "bypassDocumentValidation"],
  },
  {
    label: "DDL",
    actions: ["createCollection", "dropCollection", "renameCollectionSameDB", "createIndex", "dropIndex", "collMod", "compact", "convertToCapped"],
  },
  {
    label: "User Admin",
    actions: ["createUser", "dropUser", "grantRole", "revokeRole", "viewUser", "changePassword", "changeOwnPassword", "viewRole", "createRole", "dropRole"],
  },
  {
    label: "Server Admin",
    actions: ["serverStatus", "hostInfo", "connPoolStats", "top", "killop", "killCursors", "inprog"],
  },
  {
    label: "Cluster Admin",
    actions: ["replSetGetStatus", "replSetGetConfig", "replSetStateChange", "shutdown", "fsync", "addShard", "removeShard"],
  },
];

type Privilege = {
  resource: {
    db?: string;
    collection?: string;
    cluster?: boolean;
  };
  actions: string[];
};

export default function RolesView() {
  const { selectedDb } = useNavigationStore();
  const confirm = useConfirm();
  const { toast } = useToast();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();
  const [showBuiltin, setShowBuiltin] = useState(false);

  const { data: roles, isLoading } = useQuery<MongoRoleInfo[]>({
    queryKey: ["mongo-roles-detailed", selectedDb, showBuiltin],
    queryFn: () => databaseRequest.mongoListRolesDetailed(selectedDb || "admin", showBuiltin),
    enabled: !!selectedDb,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  // Create / Edit dialog
  const [editMode, setEditMode] = useState<"create" | "edit" | null>(null);
  const [roleName, setRoleName] = useState("");
  const [privileges, setPrivileges] = useState<Privilege[]>([]);
  const [inheritedRoles, setInheritedRoles] = useState<{ role: string; db: string }[]>([]);
  const [error, setError] = useState("");

  const resetForm = () => {
    setRoleName("");
    setPrivileges([]);
    setInheritedRoles([]);
    setError("");
  };

  const openCreate = () => {
    resetForm();
    setEditMode("create");
  };

  const openEdit = (r: MongoRoleInfo) => {
    setRoleName(r.role);
    setPrivileges(
      (r.privileges ?? []).map((p) => ({
        resource: p.resource as Privilege["resource"],
        actions: p.actions,
      }))
    );
    setInheritedRoles(r.inheritedRoles ?? []);
    setError("");
    setEditMode("edit");
  };

  const createMutation = useMutation({
    mutationFn: () =>
      databaseRequest.mongoCreateCustomRole(
        selectedDb,
        roleName,
        JSON.stringify(privileges),
        JSON.stringify(inheritedRoles)
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongo-roles-detailed"] });
      setEditMode(null);
      toast("Role created", "success");
    },
    onError: (e) => { setError((e as Error).message); toast((e as Error).message, "error"); },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      databaseRequest.mongoUpdateCustomRole(
        selectedDb,
        roleName,
        JSON.stringify(privileges),
        JSON.stringify(inheritedRoles)
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongo-roles-detailed"] });
      setEditMode(null);
      toast("Role updated", "success");
    },
    onError: (e) => { setError((e as Error).message); toast((e as Error).message, "error"); },
  });

  const dropMutation = useMutation({
    mutationFn: (name: string) => databaseRequest.mongoDropCustomRole(selectedDb, name),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mongo-roles-detailed"] }); toast("Role dropped", "success"); },
    onError: (e) => toast(e instanceof Error ? e.message : "Failed to drop role", "error"),
  });

  const handleSubmit = () => {
    setError("");
    if (!roleName.trim()) {
      setError("Role name is required");
      return;
    }
    if (privileges.length === 0 && inheritedRoles.length === 0) {
      setError("At least one privilege or inherited role is required");
      return;
    }
    if (editMode === "create") createMutation.mutate();
    else updateMutation.mutate();
  };

  const handleDrop = async (name: string) => {
    if (!await confirm({ title: "Drop role", message: `Drop role "${name}"? This cannot be undone.`, confirmLabel: "Drop", variant: "destructive" })) return;
    dropMutation.mutate(name);
  };

  const addPrivilege = () => {
    setPrivileges([
      ...privileges,
      { resource: { db: selectedDb, collection: "" }, actions: ["find"] },
    ]);
  };

  const updatePrivilege = (i: number, p: Privilege) => {
    const next = [...privileges];
    next[i] = p;
    setPrivileges(next);
  };

  const removePrivilege = (i: number) => {
    setPrivileges(privileges.filter((_, j) => j !== i));
  };

  const toggleAction = (i: number, action: string) => {
    const p = privileges[i];
    const has = p.actions.includes(action);
    updatePrivilege(i, {
      ...p,
      actions: has ? p.actions.filter((a) => a !== action) : [...p.actions, action],
    });
  };

  if (!selectedDb) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a database to view roles
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Roles</span>
        <span className="text-muted-foreground">
          {selectedDb} · {roles?.length ?? 0} roles
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant={showBuiltin ? "secondary" : "outline"}
            className="h-7 text-xs px-2.5"
            onClick={() => setShowBuiltin(!showBuiltin)}
          >
            {showBuiltin ? "Hide Built-in" : "Show Built-in"}
          </Button>
          {isAdmin && (
            <Button size="sm" className="h-7 text-xs px-3" onClick={openCreate}>
              + Role
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-2">
            {roles?.map((r) => {
              const key = `${r.db}.${r.role}`;
              const isExpanded = expanded.has(key);
              return (
                <div
                  key={key}
                  className="border border-border rounded-lg bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="p-3 flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        r.isBuiltin
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {r.isBuiltin ? "B" : "C"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{r.role}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">@{r.db}</span>
                        {r.isBuiltin && (
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                            BUILT-IN
                          </span>
                        )}
                        {!r.isBuiltin && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                            CUSTOM
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {r.privileges?.length ?? 0} privilege{(r.privileges?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
                        {r.inheritedRoles?.length ?? 0} inherited role
                        {(r.inheritedRoles?.length ?? 0) !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleExpand(key)}
                        className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                      >
                        {isExpanded ? "▾" : "▸"}
                      </button>
                      {isAdmin && !r.isBuiltin && (
                        <>
                          <button
                            onClick={() => openEdit(r)}
                            className="text-[11px] text-foreground hover:bg-accent px-2 py-1 rounded"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDrop(r.role)}
                            disabled={dropMutation.isPending}
                            className="text-[11px] text-destructive hover:bg-destructive/10 px-2 py-1 rounded"
                          >
                            Drop
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/50 px-3 py-2 bg-muted/20 text-[11px] space-y-2">
                      {r.inheritedRoles && r.inheritedRoles.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                            Inherited Roles
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {r.inheritedRoles.map((ir, i) => (
                              <span
                                key={i}
                                className="text-[10px] bg-card border border-border px-1.5 py-0.5 rounded font-mono"
                              >
                                {ir.role}@{ir.db}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {r.privileges && r.privileges.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                            Privileges
                          </div>
                          <div className="space-y-1.5">
                            {r.privileges.map((p, i) => {
                              const res = p.resource as Record<string, unknown>;
                              const resourceStr =
                                res.cluster === true
                                  ? "cluster"
                                  : `${res.db || "*"}${res.collection ? "." + res.collection : ".*"}`;
                              return (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="font-mono text-[10px] bg-card border border-border px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                                    {resourceStr}
                                  </span>
                                  <div className="flex flex-wrap gap-0.5">
                                    {p.actions.map((a) => (
                                      <span
                                        key={a}
                                        className="text-[10px] text-muted-foreground"
                                      >
                                        {a}
                                      </span>
                                    )).reduce<React.ReactNode[]>((acc, el, idx) => {
                                      if (idx > 0) acc.push(<span key={`sep-${idx}`} className="text-[10px] text-muted-foreground/40">·</span>);
                                      acc.push(el);
                                      return acc;
                                    }, [])}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {(!roles || roles.length === 0) && (
              <div className="text-center text-muted-foreground py-16 text-sm">
                No roles found
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={editMode !== null} onOpenChange={(o) => !o && setEditMode(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editMode === "create" ? "Create Role" : `Edit Role: ${roleName}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Role Name</label>
              <Input
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="e.g. analyticsWriter"
                disabled={editMode === "edit"}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Stored in database: <span className="font-mono">{selectedDb}</span>
              </p>
            </div>

            {/* Inherited roles */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Inherited Roles</label>
                <button
                  onClick={() =>
                    setInheritedRoles([...inheritedRoles, { role: "read", db: selectedDb }])
                  }
                  className="text-[11px] text-primary hover:underline"
                >
                  + Add
                </button>
              </div>
              {inheritedRoles.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={r.role}
                    onChange={(e) => {
                      const next = [...inheritedRoles];
                      next[i] = { ...next[i], role: e.target.value };
                      setInheritedRoles(next);
                    }}
                    placeholder="role name"
                    className="h-8 flex-1 text-xs"
                  />
                  <Input
                    value={r.db}
                    onChange={(e) => {
                      const next = [...inheritedRoles];
                      next[i] = { ...next[i], db: e.target.value };
                      setInheritedRoles(next);
                    }}
                    placeholder="db"
                    className="h-8 w-32 text-xs"
                  />
                  <button
                    onClick={() => setInheritedRoles(inheritedRoles.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive text-sm w-6"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Privileges */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Privileges</label>
                <button
                  onClick={addPrivilege}
                  className="text-[11px] text-primary hover:underline"
                >
                  + Add Privilege
                </button>
              </div>
              {privileges.map((p, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Resource
                    </span>
                    <button
                      onClick={() => removePrivilege(i)}
                      className="ml-auto text-muted-foreground hover:text-destructive text-sm w-6"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={p.resource.cluster === true}
                        onChange={(e) => {
                          updatePrivilege(i, {
                            ...p,
                            resource: e.target.checked ? { cluster: true } : { db: selectedDb, collection: "" },
                          });
                        }}
                      />
                      Cluster-level
                    </label>
                  </div>
                  {p.resource.cluster !== true && (
                    <div className="flex items-center gap-2">
                      <Input
                        value={p.resource.db || ""}
                        onChange={(e) => updatePrivilege(i, { ...p, resource: { ...p.resource, db: e.target.value } })}
                        placeholder="db (empty = all)"
                        className="h-8 flex-1 text-xs"
                      />
                      <Input
                        value={p.resource.collection || ""}
                        onChange={(e) => updatePrivilege(i, { ...p, resource: { ...p.resource, collection: e.target.value } })}
                        placeholder="collection (empty = all)"
                        className="h-8 flex-1 text-xs"
                      />
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                      Actions ({p.actions.length})
                    </div>
                    <div className="space-y-1.5">
                      {ACTION_CATEGORIES.map((cat) => (
                        <div key={cat.label}>
                          <div className="text-[10px] text-muted-foreground mb-0.5">{cat.label}</div>
                          <div className="flex flex-wrap gap-1">
                            {cat.actions.map((a) => {
                              const active = p.actions.includes(a);
                              return (
                                <button
                                  key={a}
                                  type="button"
                                  onClick={() => toggleAction(i, a)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                    active
                                      ? "bg-primary/10 text-primary border-primary/30"
                                      : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                                  }`}
                                >
                                  {a}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {privileges.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                  No privileges yet. Click "Add Privilege" to grant permissions.
                </p>
              )}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1 h-9" onClick={() => setEditMode(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-9"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editMode === "create"
                    ? "Create Role"
                    : "Update Role"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
