import { useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import TableView from "@/pages/dashboard/table-view";
import DocumentView from "@/pages/dashboard/document-view";
import StructureView from "@/pages/dashboard/structure-view";
import DatabaseView from "@/pages/dashboard/database-view";
import AllDatabasesView from "@/pages/dashboard/all-databases-view";
import QueryEditor from "@/pages/dashboard/query-editor";
import ImportView from "@/pages/dashboard/import-view";
import ExportView from "@/pages/dashboard/export-view";
import UsersView from "@/pages/dashboard/users-view";
import StatusView from "@/pages/dashboard/status-view";
import SecurityView from "@/pages/dashboard/security-view";
import AccountsView from "@/pages/dashboard/accounts-view";
import SearchView from "@/pages/dashboard/search-view";
import SchemaView from "@/pages/dashboard/schema-view";
import IndexesView from "@/pages/dashboard/indexes-view";
import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
import { useConnectionStore } from "@/stores/connection.store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabClass =
  "h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-medium px-3";

export default function DashboardPage() {
  const { selectedDb, selectedTable, showAllDatabases } = useNavigationStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isMongo = useConnectionStore((s) => s.dbType) === "mongodb";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Key resets the tab state to "data" whenever DB or table changes
  const tabKey = `${selectedDb}::${selectedTable}`;
  const [activeTab, setActiveTab] = useState("data");
  const [lastTabKey, setLastTabKey] = useState(tabKey);
  if (tabKey !== lastTabKey) {
    setLastTabKey(tabKey);
    setActiveTab("data");
  }

  // Global tabs when showing all databases
  if (showAllDatabases || !selectedDb) {
    return (
      <div className="flex h-screen bg-background">
        {sidebarOpen && <Sidebar />}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs key="global" defaultValue="databases" className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-border bg-card px-1 flex items-center">
              <button
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 rounded"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? "◀" : "▶"}
              </button>
              <TabsList className="h-9 bg-transparent border-0 p-0 gap-0">
                <TabsTrigger value="databases" className={tabClass}>Databases</TabsTrigger>
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
            <TabsContent value="databases" className="flex-1 overflow-hidden m-0">
              <AllDatabasesView />
            </TabsContent>
            <TabsContent value="users" className="flex-1 overflow-hidden m-0">
              <UsersView />
            </TabsContent>
            <TabsContent value="status" className="flex-1 overflow-hidden m-0">
              <StatusView />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="accounts" className="flex-1 overflow-hidden m-0">
                <AccountsView />
              </TabsContent>
            )}
            {isAdmin && (
              <TabsContent value="security" className="flex-1 overflow-hidden m-0">
                <SecurityView />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    );
  }
    
    
  return (
    <div className="flex h-screen bg-background">
      {sidebarOpen && <Sidebar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs key="db" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-border bg-card px-1 flex items-center">
            <button
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 rounded"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <TabsList className="h-9 bg-transparent border-0 p-0 gap-0">
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
              {isMongo && selectedTable && (
                <TabsTrigger value="indexes" className={tabClass}>Indexes</TabsTrigger>
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
          <TabsContent value="data" className="flex-1 overflow-hidden m-0">
            {selectedTable ? (isMongo ? <DocumentView /> : <TableView />) : <DatabaseView />}
          </TabsContent>
          {selectedTable && (
            <TabsContent value="structure" className="flex-1 overflow-hidden m-0">
              <StructureView />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="query" className="flex-1 overflow-hidden m-0">
              <QueryEditor />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="import" className="flex-1 overflow-hidden m-0">
              <ImportView />
            </TabsContent>
          )}
          {!isMongo && (
            <TabsContent value="schema" className="flex-1 overflow-hidden m-0">
              <SchemaView />
            </TabsContent>
          )}
          {isMongo && selectedTable && (
            <TabsContent value="indexes" className="flex-1 overflow-hidden m-0">
              <IndexesView />
            </TabsContent>
          )}
          <TabsContent value="search" className="flex-1 overflow-hidden m-0">
            <SearchView />
          </TabsContent>
          <TabsContent value="export" className="flex-1 overflow-hidden m-0">
            <ExportView />
          </TabsContent>
          <TabsContent value="users" className="flex-1 overflow-hidden m-0">
            <UsersView />
          </TabsContent>
          <TabsContent value="status" className="flex-1 overflow-hidden m-0">
            <StatusView />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="accounts" className="flex-1 overflow-hidden m-0">
              <AccountsView />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="security" className="flex-1 overflow-hidden m-0">
              <SecurityView />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
