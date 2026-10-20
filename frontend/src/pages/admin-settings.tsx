// @soleil-clems: Frontend - Admin settings (accounts & security)
import { lazy, Suspense } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AccountsView = lazy(() => import("@/pages/dashboard/accounts-view"));
const SecurityView = lazy(() => import("@/pages/dashboard/security-view"));

const tabClass =
  "h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-medium px-3";

type Props = {
  onBack: () => void;
};

export default function AdminSettingsPage({ onBack }: Props) {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-7 text-xs px-2 -ml-1 sm:-ml-2 shrink-0"
        >
          ← Back
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold shrink-0">
            sA
          </div>
          <div className="min-w-0 hidden sm:block">
            <p className="text-sm font-semibold leading-none">socAdmin</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Admin settings
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={logout}
          >
            Logout
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="accounts" className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border bg-card px-1">
          <TabsList className="h-9 bg-transparent border-0 p-0 gap-0">
            <TabsTrigger value="accounts" className={tabClass}>
              Accounts
            </TabsTrigger>
            <TabsTrigger value="security" className={tabClass}>
              Security
            </TabsTrigger>
          </TabsList>
        </div>
        <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-sm text-muted-foreground">Loading...</div></div>}>
        <TabsContent value="accounts" className="flex-1 overflow-hidden m-0">
          <AccountsView />
        </TabsContent>
        <TabsContent value="security" className="flex-1 overflow-hidden m-0">
          <SecurityView />
        </TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
