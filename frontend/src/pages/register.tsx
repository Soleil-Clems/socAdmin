import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterFormData } from "@/schemas/auth.schema";
import { useRegister } from "@/hooks/mutations/use-register";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";

type Props = {
  onSwitchToLogin: () => void;
};

export default function RegisterPage({ onSwitchToLogin }: Props) {
  const registerMutation = useRegister();
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isFirstUser, setIsFirstUser] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = (data: RegisterFormData) => {
    setServerError("");
    registerMutation.mutate(
      { email: data.email, password: data.password },
      {
        onSuccess: (res: Record<string, unknown>) => {
          if (res?.role === "admin") setIsFirstUser(true);
          setSuccess(true);
        },
        onError: (err) => {
          setServerError(err.message);
        },
      }
    );
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl">
            ✓
          </div>
          {isFirstUser ? (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Welcome to socAdmin</h2>
              <div className="text-sm text-muted-foreground space-y-2 text-left bg-muted/50 rounded-lg p-4">
                <p>
                  You are the <span className="font-semibold text-primary">administrator</span> of this instance.
                </p>
                <ul className="space-y-1.5 list-none">
                  <li className="flex gap-2">
                    <span className="text-primary shrink-0">&#x2022;</span>
                    <span>Full access: create, edit, and delete databases, tables, and rows</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary shrink-0">&#x2022;</span>
                    <span>Run SQL queries, import and export data</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary shrink-0">&#x2022;</span>
                    <span>Manage users, security settings, and saved connections</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary shrink-0">&#x2022;</span>
                    <span>Other users who register will be <span className="font-medium">read-only</span> by default — you can promote them later</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-semibold">Account created</h2>
              <p className="text-sm text-muted-foreground mt-1">
                You can now sign in with your credentials.
                Your account is <span className="font-medium">read-only</span> — an administrator can grant you write access.
              </p>
            </div>
          )}
          <Button className="w-full h-9" onClick={onSwitchToLogin}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[480px] bg-primary text-primary-foreground flex-col justify-between p-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">socAdmin</h1>
          <p className="text-sm opacity-80 mt-1">Database administration</p>
        </div>
        <div className="space-y-4">
          <p className="text-lg font-medium leading-snug">
            Manage MySQL, PostgreSQL &amp; MongoDB from a single interface.
          </p>
          <p className="text-sm opacity-70 leading-relaxed">
            Browse tables, run queries, import &amp; export data — no terminal required.
          </p>
        </div>
        <p className="text-xs opacity-50">v1.0</p>
      </div>

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
            <h2 className="text-xl font-semibold">Create account</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Set up your socAdmin credentials
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

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-xs font-medium">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                className="h-9"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {serverError && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{serverError}</p>
            )}

            <Button
              type="submit"
              className="w-full h-9"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? "Creating account..." : "Create account"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-primary font-medium hover:underline"
              >
                Sign in
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
