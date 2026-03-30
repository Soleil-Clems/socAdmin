import { useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useConnectionStore } from "@/stores/connection.store";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ConnectPage from "@/pages/connect";
import DashboardPage from "@/pages/dashboard";

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const [authPage, setAuthPage] = useState<"login" | "register">("login");

  if (!isAuthenticated) {
    if (authPage === "register") {
      return (
        <RegisterPage onSwitchToLogin={() => setAuthPage("login")} />
      );
    }
    return (
      <LoginPage onSwitchToRegister={() => setAuthPage("register")} />
    );
  }

  if (!isConnected) {
    return <ConnectPage />;
  }

  return <DashboardPage />;
}

export default App;
