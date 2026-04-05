import { useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import TableView from "@/pages/dashboard/table-view";
import StructureView from "@/pages/dashboard/structure-view";
import DatabaseView from "@/pages/dashboard/database-view";
import AllDatabasesView from "@/pages/dashboard/all-databases-view";
import QueryEditor from "@/pages/dashboard/query-editor";
import ImportView from "@/pages/dashboard/import-view";
import ExportView from "@/pages/dashboard/export-view";
import UsersView from "@/pages/dashboard/users-view";
import StatusView from "@/pages/dashboard/status-view";
import { useNavigationStore } from "@/stores/navigation.store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabClass =
  "h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-medium px-3";

export default function DashboardPage() {
  const { selectedDb, selectedTable, showAllDatabases } = useNavigationStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Global tabs when showing all databases
  if (showAllDatabases || !selectedDb) {
    return (
      <div className="flex h-screen bg-background">
        {sidebarOpen && <Sidebar />}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs defaultValue="databases" className="flex-1 flex flex-col overflow-hidden">
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
          </Tabs>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {sidebarOpen && <Sidebar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs defaultValue="data" className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-border bg-card px-1 flex items-center">
            <button
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 rounded"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <TabsList className="h-9 bg-transparent border-0 p-0 gap-0">
              <TabsTrigger value="data" className={tabClass}>
                {selectedTable ? "Browse" : "Tables"}
              </TabsTrigger>
              {selectedTable && (
                <TabsTrigger value="structure" className={tabClass}>Structure</TabsTrigger>
              )}
              <TabsTrigger value="query" className={tabClass}>SQL</TabsTrigger>
              <TabsTrigger value="import" className={tabClass}>Import</TabsTrigger>
              <TabsTrigger value="export" className={tabClass}>Export</TabsTrigger>
              <TabsTrigger value="users" className={tabClass}>Users</TabsTrigger>
              <TabsTrigger value="status" className={tabClass}>Status</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="data" className="flex-1 overflow-hidden m-0">
            {selectedTable ? <TableView /> : <DatabaseView />}
          </TabsContent>
          {selectedTable && (
            <TabsContent value="structure" className="flex-1 overflow-hidden m-0">
              <StructureView />
            </TabsContent>
          )}
          <TabsContent value="query" className="flex-1 overflow-hidden m-0">
            <QueryEditor />
          </TabsContent>
          <TabsContent value="import" className="flex-1 overflow-hidden m-0">
            <ImportView />
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
        </Tabs>
      </div>
    </div>
  );
}
