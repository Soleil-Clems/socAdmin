import { useConnectionStore } from "@/stores/connection.store";
import ConnectPage from "@/pages/connect";
import DashboardPage from "@/pages/dashboard";

function App() {
  const isConnected = useConnectionStore((s) => s.isConnected);

  if (!isConnected) {
    return <ConnectPage />;
  }

  return <DashboardPage />;
}

export default App;
