import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginFormData } from "@/schemas/auth.schema";
import { useLogin } from "@/hooks/mutations/use-login";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthBrandPanel } from "@/components/auth-brand-panel";

type Props = {
  onSwitchToRegister: () => void;
};

export default function LoginPage({ onSwitchToRegister }: Props) {
  const loginMutation = useLogin();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormData) => {
    setServerError("");
    loginMutation.mutate(data, {
      onSuccess: (res) => {
        setAuthenticated(res.role);
      },
      onError: (err) => {
        setServerError(err.message);
      },
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AuthBrandPanel />

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <h1 className="text-2xl font-bold tracking-tight text-primary">socAdmin</h1>
            <p className="text-sm text-muted-foreground mt-1">Database administration</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your credentials to continue
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="h-9"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="h-9"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{serverError}</p>
            )}

            <Button
              type="submit"
              className="w-full h-9"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Signing in..." : "Sign in"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              No account?{" "}
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="text-primary font-medium hover:underline"
              >
                Create one
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
