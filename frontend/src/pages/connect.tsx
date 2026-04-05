import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { connectSchema, dbTypes, type ConnectFormData } from "@/schemas/connect.schema";
import { useConnect } from "@/hooks/mutations/use-connect";
import { useConnectionStore } from "@/stores/connection.store";
import { useSystemInfo } from "@/hooks/queries/use-system-info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export default function ConnectPage() {
  const connectMutation = useConnect();
  const setConnected = useConnectionStore((s) => s.setConnected);
  const { data: systemInfo } = useSystemInfo();

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

  const handleTypeChange = (value: string, onChange: (value: string) => void) => {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-primary">socAdmin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect to a database server
          </p>
        </div>

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

          <Button
            type="submit"
            className="w-full h-9"
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? "Connecting..." : "Connect"}
          </Button>
        </form>
      </div>
    </div>
  );
}
