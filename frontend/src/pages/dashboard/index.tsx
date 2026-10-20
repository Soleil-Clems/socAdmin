// @soleil-clems: Dashboard - Main layout & tab navigation
import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

const TableView = lazy(() => import("@/pages/dashboard/table-view"));
const DocumentView = lazy(() => import("@/pages/dashboard/document-view"));
const StructureView = lazy(() => import("@/pages/dashboard/structure-view"));
const DatabaseView = lazy(() => import("@/pages/dashboard/database-view"));
const AllDatabasesView = lazy(() => import("@/pages/dashboard/all-databases-view"));
const QueryEditor = lazy(() => import("@/pages/dashboard/query-editor"));
const ImportView = lazy(() => import("@/pages/dashboard/import-view"));
const ExportView = lazy(() => import("@/pages/dashboard/export-view"));
const UsersView = lazy(() => import("@/pages/dashboard/users-view"));
const StatusView = lazy(() => import("@/pages/dashboard/status-view"));
const SecurityView = lazy(() => import("@/pages/dashboard/security-view"));
const AccountsView = lazy(() => import("@/pages/dashboard/accounts-view"));
const SearchView = lazy(() => import("@/pages/dashboard/search-view"));
const SchemaView = lazy(() => import("@/pages/dashboard/schema-view"));
const TriggersView = lazy(() => import("@/pages/dashboard/triggers-view"));
const RoutinesView = lazy(() => import("@/pages/dashboard/routines-view"));
const IndexesView = lazy(() => import("@/pages/dashboard/indexes-view"));
const ViewsView = lazy(() => import("@/pages/dashboard/views-view"));
const ProfilerView = lazy(() => import("@/pages/dashboard/profiler-view"));
const AggregationView = lazy(() => import("@/pages/dashboard/aggregation-view"));
const RolesView = lazy(() => import("@/pages/dashboard/roles-view"));
const GridFSView = lazy(() => import("@/pages/dashboard/gridfs-view"));
const ShardingView = lazy(() => import("@/pages/dashboard/sharding-view"));
const ChangeStreamsView = lazy(() => import("@/pages/dashboard/change-streams-view"));

const ViewFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="text-sm text-muted-foreground">Loading...</div>
  </div>
);

import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { databaseRequest } from "@/requests/database.request";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabClass =
  "h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-medium px-2 md:px-3 shrink-0";

export default function DashboardPage() {
  const { selectedDb, selectedTable, showAllDatabases, setShowAllDatabases } = useNavigationStore();
  const resetNav = useNavigationStore((s) => s.reset);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const isMongo = useConnectionStore((s) => s.dbType) === "mongodb";
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  // Key resets the tab state to "data" whenever DB or table changes
  const tabKey = `${selectedDb}::${selectedTable}`;
  const [activeTab, setActiveTab] = useState("data");
  const [lastTabKey, setLastTabKey] = useState(tabKey);
  if (tabKey !== lastTabKey) {
    setLastTabKey(tabKey);
    setActiveTab("data");
  }

  const handleDisconnect = useCallback(() => {
    databaseRequest.disconnect().catch(() => {});
    resetNav();
    disconnect();
  }, [resetNav, disconnect]);

  const hotkeys = useMemo(() => [
    { key: "k", ctrl: true, handler: () => setActiveTab("search") },
    { key: "e", ctrl: true, handler: () => { if (isAdmin) setActiveTab("query"); } },
    { key: "b", ctrl: true, handler: () => setSidebarOpen((v) => !v) },
    { key: "r", ctrl: true, shift: true, handler: () => queryClient.invalidateQueries() },
    { key: "d", ctrl: true, shift: true, handler: handleDisconnect },
    { key: "Escape", handler: () => {
      if (selectedTable) setShowAllDatabases(false);
      else setShowAllDatabases(true);
    }},
  ], [isAdmin, queryClient, handleDisconnect, selectedTable, setShowAllDatabases]);

  useHotkeys(hotkeys);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const sidebarEl = sidebarOpen && (
    isMobile ? (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={closeSidebar} />
        <div className="fixed inset-y-0 left-0 z-50 w-56">
          <Sidebar onClose={closeSidebar} />
        </div>
      </>
    ) : (
      <Sidebar />
    )
  );

  // Global tabs when showing all databases
  if (showAllDatabases || !selectedDb) {
    return (
      <div className="flex h-screen bg-background">
        {sidebarEl}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
          <Tabs key="global" defaultValue="databases" className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="border-b border-border bg-card px-1 flex items-center">
              <button
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 rounded"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen && !isMobile ? "◀" : "☰"}
              </button>
              <TabsList className="h-9 bg-transparent border-0 p-0 gap-0 overflow-x-auto scrollbar-none">
                <TabsTrigger value="databases" className={tabClass}>Databases</TabsTrigger>
                <TabsTrigger value="users" className={tabClass}>Users</TabsTrigger>
                <TabsTrigger value="status" className={tabClass}>Status</TabsTrigger>
                {isMongo && (
                  <TabsTrigger value="sharding" className={tabClass}>Sharding</TabsTrigger>
                )}
                {isAdmin && (
                  <TabsTrigger value="accounts" className={tabClass}>Accounts</TabsTrigger>
                )}
                {isAdmin && (
                  <TabsTrigger value="security" className={tabClass}>Security</TabsTrigger>
                )}
              </TabsList>
            </div>
            <Suspense fallback={<ViewFallback />}>
            <TabsContent value="databases" className="flex-1 overflow-hidden m-0 min-h-0">
              <AllDatabasesView />
            </TabsContent>
            <TabsContent value="users" className="flex-1 overflow-hidden m-0 min-h-0">
              <UsersView />
            </TabsContent>
            <TabsContent value="status" className="flex-1 overflow-hidden m-0 min-h-0">
              <StatusView />
            </TabsContent>
            {isMongo && (
              <TabsContent value="sharding" className="flex-1 overflow-hidden m-0 min-h-0">
                <ShardingView />
              </TabsContent>
            )}
            {isAdmin && (
              <TabsContent value="accounts" className="flex-1 overflow-hidden m-0 min-h-0">
                <AccountsView />
              </TabsContent>
            )}
            {isAdmin && (
              <TabsContent value="security" className="flex-1 overflow-hidden m-0 min-h-0">
                <SecurityView />
              </TabsContent>
            )}
            </Suspense>
          </Tabs>
        </div>
      </div>
    );
  }
    
    
  return (
    <div className="flex h-screen bg-background">
      {sidebarEl}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
        <Tabs key="db" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="border-b border-border bg-card px-1 flex items-center">
            <button
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 rounded"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen && !isMobile ? "◀" : "☰"}
            </button>
            <TabsList className="h-9 bg-transparent border-0 p-0 gap-0 overflow-x-auto scrollbar-none">
              <TabsTrigger value="data" className={tabClass}>
                {selectedTable ? (isMongo ? "Documents" : "Browse") : (isMongo ? "Collections" : "Tables")}
              </TabsTrigger>
              {selectedTable && (
                <TabsTrigger value="structure" className={tabClass}>Structure</TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger value="query" className={tabClass}>{isMongo ? "Shell" : "SQL"}</TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger value="import" className={tabClass}>Import</TabsTrigger>
              )}
              {!isMongo && (
                <TabsTrigger value="schema" className={tabClass}>Schema</TabsTrigger>
              )}
              {!isMongo && (
                <TabsTrigger value="triggers" className={tabClass}>Triggers</TabsTrigger>
              )}
              {!isMongo && (
                <TabsTrigger value="routines" className={tabClass}>Routines</TabsTrigger>
              )}
              {isMongo && selectedTable && (
                <TabsTrigger value="indexes" className={tabClass}>Indexes</TabsTrigger>
              )}
              {isMongo && selectedTable && isAdmin && (
                <TabsTrigger value="aggregate" className={tabClass}>Aggregate</TabsTrigger>
              )}
              {isMongo && (
                <TabsTrigger value="views" className={tabClass}>Views</TabsTrigger>
              )}
              {isMongo && isAdmin && (
                <TabsTrigger value="profiler" className={tabClass}>Profiler</TabsTrigger>
              )}
              {isMongo && (
                <TabsTrigger value="gridfs" className={tabClass}>GridFS</TabsTrigger>
              )}
              {isMongo && isAdmin && (
                <TabsTrigger value="roles" className={tabClass}>Roles</TabsTrigger>
              )}
              {isMongo && selectedTable && isAdmin && (
                <TabsTrigger value="watch" className={tabClass}>Watch</TabsTrigger>
              )}
              <TabsTrigger value="search" className={tabClass}>Search</TabsTrigger>
              <TabsTrigger value="export" className={tabClass}>Export</TabsTrigger>
              <TabsTrigger value="users" className={tabClass}>Users</TabsTrigger>
              <TabsTrigger value="status" className={tabClass}>Status</TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="accounts" className={tabClass}>Accounts</TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger value="security" className={tabClass}>Security</TabsTrigger>
              )}
            </TabsList>
          </div>
          <Suspense fallback={<ViewFallback />}>
          <TabsContent value="data" className="flex-1 overflow-hidden m-0 min-h-0">
            {selectedTable ? (isMongo ? <DocumentView /> : <TableView />) : <DatabaseView />}
          </TabsContent>
          {selectedTable && (
            <TabsContent value="structure" className="flex-1 overflow-hidden m-0 min-h-0">
              <StructureView />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="query" className="flex-1 overflow-hidden m-0 min-h-0">
              <QueryEditor />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="import" className="flex-1 overflow-hidden m-0 min-h-0">
              <ImportView />
            </TabsContent>
          )}
          {!isMongo && (
            <TabsContent value="schema" className="flex-1 overflow-hidden m-0 min-h-0">
              <SchemaView />
            </TabsContent>
          )}
          {!isMongo && (
            <TabsContent value="triggers" className="flex-1 overflow-hidden m-0 min-h-0">
              <TriggersView />
            </TabsContent>
          )}
          {!isMongo && (
            <TabsContent value="routines" className="flex-1 overflow-hidden m-0 min-h-0">
              <RoutinesView />
            </TabsContent>
          )}
          {isMongo && selectedTable && (
            <TabsContent value="indexes" className="flex-1 overflow-hidden m-0 min-h-0">
              <IndexesView />
            </TabsContent>
          )}
          {isMongo && selectedTable && isAdmin && (
            <TabsContent value="aggregate" className="flex-1 overflow-hidden m-0 min-h-0">
              <AggregationView />
            </TabsContent>
          )}
          {isMongo && (
            <TabsContent value="views" className="flex-1 overflow-hidden m-0 min-h-0">
              <ViewsView />
            </TabsContent>
          )}
          {isMongo && isAdmin && (
            <TabsContent value="profiler" className="flex-1 overflow-hidden m-0 min-h-0">
              <ProfilerView />
            </TabsContent>
          )}
          {isMongo && (
            <TabsContent value="gridfs" className="flex-1 overflow-hidden m-0 min-h-0">
              <GridFSView />
            </TabsContent>
          )}
          {isMongo && isAdmin && (
            <TabsContent value="roles" className="flex-1 overflow-hidden m-0 min-h-0">
              <RolesView />
            </TabsContent>
          )}
          {isMongo && selectedTable && isAdmin && (
            <TabsContent value="watch" className="flex-1 overflow-hidden m-0 min-h-0">
              <ChangeStreamsView />
            </TabsContent>
          )}
          <TabsContent value="search" className="flex-1 overflow-hidden m-0 min-h-0">
            <SearchView />
          </TabsContent>
          <TabsContent value="export" className="flex-1 overflow-hidden m-0 min-h-0">
            <ExportView />
          </TabsContent>
          <TabsContent value="users" className="flex-1 overflow-hidden m-0 min-h-0">
            <UsersView />
          </TabsContent>
          <TabsContent value="status" className="flex-1 overflow-hidden m-0 min-h-0">
            <StatusView />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="accounts" className="flex-1 overflow-hidden m-0 min-h-0">
              <AccountsView />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="security" className="flex-1 overflow-hidden m-0 min-h-0">
              <SecurityView />
            </TabsContent>
          )}
          </Suspense>
        </Tabs>
      </div>
    </div>
  );
}
