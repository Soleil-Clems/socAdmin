import { useAppUsers } from "@/hooks/queries/use-app-users";
import { useUpdateUserRole } from "@/hooks/mutations/use-update-user-role";
import { useDeleteUser } from "@/hooks/mutations/use-delete-user";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AccountsView() {
  const { data: users, isLoading, error } = useAppUsers();
  const updateRole = useUpdateUserRole();
  const deleteUser = useDeleteUser();

  const adminCount = users?.filter((u) => u.role === "admin").length ?? 0;

  const handleRoleChange = (id: number, role: "admin" | "readonly") => {
    updateRole.mutate({ id, role });
  };

  const handleDelete = (id: number, email: string) => {
    if (!confirm(`Delete user "${email}"? This cannot be undone.`)) return;
    deleteUser.mutate(id);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Accounts</span>
        <span className="text-muted-foreground">
          {users?.length ?? 0} users · {adminCount} admin
        </span>
      </div>

      {/* Error banners */}
      {updateRole.isError && (
        <div className="mx-3 mt-3 px-3 py-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded">
          {updateRole.error.message}
        </div>
      )}
      {deleteUser.isError && (
        <div className="mx-3 mt-3 px-3 py-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded">
          {deleteUser.error.message}
        </div>
      )}

      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <table className="w-full data-table">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-12">
                  #
                </th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Email
                </th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-40">
                  Role
                </th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-44">
                  Created
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => {
                const isLastAdmin = u.role === "admin" && adminCount <= 1;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border/50 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-3 py-1.5 text-[12px] text-muted-foreground tabular-nums">
                      {u.id}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] font-medium text-foreground">
                      {u.email}
                    </td>
                    <td className="px-3 py-1.5">
                      <Select
                        value={u.role}
                        onValueChange={(v) =>
                          handleRoleChange(u.id, v as "admin" | "readonly")
                        }
                        disabled={updateRole.isPending || isLastAdmin}
                      >
                        <SelectTrigger className="h-7 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Admin
                            </span>
                          </SelectItem>
                          <SelectItem value="readonly">
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Read-only
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        className="px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        onClick={() => handleDelete(u.id, u.email)}
                        disabled={deleteUser.isPending || isLastAdmin}
                        title={isLastAdmin ? "Cannot delete the last admin" : undefined}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {users?.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-12 text-sm">
                    No users
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}
