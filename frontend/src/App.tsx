import { useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useConnectionStore } from "@/stores/connection.store";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ConnectPage from "@/pages/connect";
import DashboardPage from "@/pages/dashboard";
import AdminSettingsPage from "@/pages/admin-settings";

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const [authPage, setAuthPage] = useState<"login" | "register">("login");
  const [showAdminSettings, setShowAdminSettings] = useState(false);

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
