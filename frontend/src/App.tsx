import { useConnectionStore } from "@/stores/connection.store";
import ConnectPage from "@/pages/connect";

function App() {
  const isConnected = useConnectionStore((s) => s.isConnected);

  if (!isConnected) {
    return <ConnectPage />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Connected — dashboard coming next</p>
    </div>
  );
}

export default App;
