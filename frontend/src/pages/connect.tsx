import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { connectSchema, type ConnectFormData } from "@/schemas/connect.schema";
import { useConnect } from "@/hooks/mutations/use-connect";
import { useConnectionStore } from "@/stores/connection.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConnectPage() {
  const connectMutation = useConnect();
  const setConnected = useConnectionStore((s) => s.setConnected);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectFormData>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      host: "127.0.0.1",
      port: 8889,
      user: "root",
      password: "root",
    },
  });

  const onSubmit = (data: ConnectFormData) => {
    connectMutation.mutate(data, {
      onSuccess: () => {
        setConnected(data.host, data.port, data.user);
      },
    });
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
