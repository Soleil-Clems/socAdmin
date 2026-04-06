import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { connectSchema, dbTypes, type ConnectFormData } from "@/schemas/connect.schema";
import { useConnect } from "@/hooks/mutations/use-connect";
import { useConnectionStore } from "@/stores/connection.store";
import { useSystemInfo } from "@/hooks/queries/use-system-info";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { connectionRequest, type SavedConnection } from "@/requests/connection.request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";

const defaultPorts: Record<string, number> = {
  mysql: 8889,
  postgresql: 5432,
  mongodb: 27017,
};

const dbLabels: Record<string, string> = {
  mysql: "MySQL / MariaDB",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
};

const dbIcons: Record<string, string> = {
  mysql: "M",
  postgresql: "P",
  mongodb: "M",
};

type Props = {
  onOpenAdmin?: () => void;
};

export default function ConnectPage({ onOpenAdmin }: Props = {}) {
  const connectMutation = useConnect();
  const setConnected = useConnectionStore((s) => s.setConnected);
  const { data: systemInfo } = useSystemInfo();
  const queryClient = useQueryClient();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [pendingSave, setPendingSave] = useState<ConnectFormData | null>(null);

  const { data: savedConnections } = useQuery<SavedConnection[]>({
    queryKey: ["saved-connections"],
    queryFn: connectionRequest.listSaved,
  });

  const useSavedMutation = useMutation({
    mutationFn: (id: number) => connectionRequest.useSaved(id),
  });

  const deleteSavedMutation = useMutation({
    mutationFn: (id: number) => connectionRequest.deleteSaved(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-connections"] }),
  });

  const saveConnectionMutation = useMutation({
    mutationFn: (data: { name: string; type: string; host: string; port: number; user: string; password: string }) =>
      connectionRequest.save(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-connections"] });
      setSaveDialogOpen(false);
      setSaveName("");
      setPendingSave(null);
    },
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ConnectFormData>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      host: "127.0.0.1",
      port: 8889,
      user: "root",
      password: "",
      type: "mysql",
    },
  });

  const selectedType = watch("type");

  const onSubmit = (data: ConnectFormData) => {
    connectMutation.mutate(data, {
      onSuccess: () => {
        setConnected(data.host, data.port, data.user, data.type);
      },
    });
  };

  const handleSaveAndConnect = (data: ConnectFormData) => {
    setPendingSave(data);
    setSaveName(`${dbLabels[data.type] || data.type} - ${data.host}`);
    setSaveDialogOpen(true);
  };

  const confirmSave = () => {
    if (!pendingSave || !saveName.trim()) return;
    saveConnectionMutation.mutate({
      name: saveName.trim(),
      type: pendingSave.type,
      host: pendingSave.host,
      port: pendingSave.port,
      user: pendingSave.user,
      password: pendingSave.password,
    });
    // Also connect
    connectMutation.mutate(pendingSave, {
      onSuccess: () => {
        setConnected(pendingSave!.host, pendingSave!.port, pendingSave!.user, pendingSave!.type);
      },
    });
  };

  const handleUseSaved = (conn: SavedConnection) => {
    useSavedMutation.mutate(conn.id, {
      onSuccess: () => {
        setConnected(conn.host, conn.port, conn.user, conn.type);
      },
    });
  };

  const handleTypeChange = (value: ConnectFormData["type"], onChange: (value: string) => void) => {
    onChange(value);
    setValue("port", defaultPorts[value] || 3306);
    if (value === "mongodb") {
      setValue("user", "");
      setValue("password", "");
    } else if (value === "postgresql") {
      setValue("user", systemInfo?.os_user || "");
      setValue("password", "");
    } else {
      setValue("user", "root");
      setValue("password", "");
    }
  };

  const hasSaved = savedConnections && savedConnections.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 relative">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        {onOpenAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenAdmin}
            className="h-8 text-xs gap-1.5"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Admin settings
          </Button>
        )}
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-primary">socAdmin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect to a database server
          </p>
        </div>

        {/* Saved connections */}
        {hasSaved && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Saved Connections
            </p>
            <div className="border border-border rounded divide-y divide-border">
              {savedConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-accent/40 transition-colors group"
                >
                  <button
                    type="button"
                    onClick={() => handleUseSaved(conn)}
                    disabled={useSavedMutation.isPending}
                    className="flex items-center gap-3 text-left flex-1 min-w-0"
                  >
                    <span className={`w-7 h-7 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${
                      conn.type === "mysql" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                      conn.type === "postgresql" ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" :
                      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    }`}>
                      {dbIcons[conn.type] || "?"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{conn.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {conn.user}@{conn.host}:{conn.port}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteSavedMutation.mutate(conn.id); }}
                    className="text-[11px] text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
            {useSavedMutation.isError && (
              <p className="text-xs text-destructive mt-2">{useSavedMutation.error.message}</p>
            )}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground">or connect manually</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </div>
        )}

        {/* DB type selector as segmented control */}
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <div className="flex gap-2">
              {dbTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t, field.onChange)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors border ${
                    selectedType === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <span className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                    selectedType === t
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {dbIcons[t]}
                  </span>
                  {dbLabels[t]}
                </button>
              ))}
            </div>
          )}
        />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="host" className="text-xs font-medium">Host</Label>
              <Input id="host" className="h-9" {...register("host")} />
              {errors.host && (
                <p className="text-xs text-destructive">{errors.host.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="port" className="text-xs font-medium">Port</Label>
              <Input id="port" type="number" className="h-9" {...register("port", { valueAsNumber: true })} />
              {errors.port && (
                <p className="text-xs text-destructive">{errors.port.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="user" className="text-xs font-medium">User</Label>
              <Input id="user" className="h-9" {...register("user")} />
              {errors.user && (
                <p className="text-xs text-destructive">{errors.user.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium">Password</Label>
              <Input id="password" type="password" className="h-9" placeholder="optional" {...register("password")} />
            </div>
          </div>

          {connectMutation.isError && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {connectMutation.error.message}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1 h-9"
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 px-3 text-xs"
              disabled={connectMutation.isPending}
              onClick={handleSubmit(handleSaveAndConnect)}
            >
              Save &amp; Connect
            </Button>
          </div>
        </form>

        {/* Save dialog */}
        {saveDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-card border border-border rounded-lg p-5 w-full max-w-sm shadow-lg space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Save Connection</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Password will be encrypted with AES-256 at rest.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Connection Name</Label>
                <Input
                  className="h-9"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmSave()}
                  autoFocus
                />
              </div>
              {saveConnectionMutation.isError && (
                <p className="text-xs text-destructive">{saveConnectionMutation.error.message}</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => { setSaveDialogOpen(false); setPendingSave(null); }}
                >
                  Cancel
                </Button>
                <Button
                  className="h-8 text-xs"
                  onClick={confirmSave}
                  disabled={saveConnectionMutation.isPending || !saveName.trim()}
                >
                  {saveConnectionMutation.isPending ? "Saving..." : "Save & Connect"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
