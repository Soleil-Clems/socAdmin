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
  const setRole = useAuthStore((s) => s.setRole);
  const logout = useAuthStore((s) => s.logout);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const [authPage, setAuthPage] = useState<"login" | "register">("login");
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [verifying, setVerifying] = useState(isAuthenticated);

  // On mount, if tokens exist, verify them with the backend.
  // If valid → stay authenticated and sync role.
  // If invalid → clear stale tokens and show login.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    authRequest
      .me()
      .then((res) => {
        if (!cancelled && res?.role) setRole(res.role);
      })
      .catch(() => {
        if (!cancelled) logout();
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
