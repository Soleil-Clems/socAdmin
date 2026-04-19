import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useConnectionStore } from "@/stores/connection.store";
import { authRequest } from "@/requests/auth.request";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ConnectPage from "@/pages/connect";
import DashboardPage from "@/pages/dashboard";
import AdminSettingsPage from "@/pages/admin-settings";

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const [authPage, setAuthPage] = useState<"login" | "register">("login");
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [verifying, setVerifying] = useState(true);

  // On mount, call /auth/me to check if HttpOnly cookies contain a valid session.
  // If valid → set authenticated with role. If not → show login.
  useEffect(() => {
    let cancelled = false;
    authRequest
      .me()
      .then((res) => {
        if (!cancelled && res?.role) setAuthenticated(res.role);
      })
      .catch(() => {
        // No valid session — stay on login page
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (verifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Verifying session...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authPage === "register") {
      return <RegisterPage onSwitchToLogin={() => setAuthPage("login")} />;
    }
    return <LoginPage onSwitchToRegister={() => setAuthPage("register")} />;
  }

  if (!isConnected) {
    if (showAdminSettings && isAdmin) {
      return <AdminSettingsPage onBack={() => setShowAdminSettings(false)} />;
    }
    return <ConnectPage onOpenAdmin={isAdmin ? () => setShowAdminSettings(true) : undefined} />;
  }

  return <DashboardPage />;
}

export default App;
