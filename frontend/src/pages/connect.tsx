import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { connectSchema, dbTypes, type ConnectFormData } from "@/schemas/connect.schema";
import { useConnect } from "@/hooks/mutations/use-connect";
import { useConnectionStore } from "@/stores/connection.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const defaultPorts: Record<string, number> = {
  mysql: 3306,
  postgresql: 5432,
  mongodb: 27017,
};

const dbLabels: Record<string, string> = {
  mysql: "MySQL / MariaDB",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
};

export default function ConnectPage() {
  const connectMutation = useConnect();
  const setConnected = useConnectionStore((s) => s.setConnected);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ConnectFormData>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      password: "",
      type: "mysql",
    },
  });

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
    } else {
      setValue("user", "root");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            socAdmin
          </CardTitle>
          <p className="text-center text-muted-foreground text-sm">
            Connect to your database
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Database type</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => v && handleTypeChange(v, field.onChange)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dbTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {dbLabels[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="host">Host</Label>
                <Input id="host" {...register("host")} />
                {errors.host && (
                  <p className="text-sm text-destructive">{errors.host.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input id="port" type="number" {...register("port", { valueAsNumber: true })} />
                {errors.port && (
                  <p className="text-sm text-destructive">{errors.port.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user">User</Label>
              <Input id="user" {...register("user")} />
              {errors.user && (
                <p className="text-sm text-destructive">{errors.user.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register("password")} />
            </div>

            {connectMutation.isError && (
              <p className="text-sm text-destructive">
                {connectMutation.error.message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
