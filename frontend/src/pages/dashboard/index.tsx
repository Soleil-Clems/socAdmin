import { useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import TableView from "@/pages/dashboard/table-view";
import StructureView from "@/pages/dashboard/structure-view";
import DatabaseView from "@/pages/dashboard/database-view";
import QueryEditor from "@/pages/dashboard/query-editor";
import { useNavigationStore } from "@/stores/navigation.store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DashboardPage() {
  const { selectedTable } = useNavigationStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
              <TabsTrigger
                value="data"
                className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-medium px-4"
              >
                Data
              </TabsTrigger>
              {selectedTable && (
                <TabsTrigger
                  value="structure"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-medium px-4"
                >
                  Structure
                </TabsTrigger>
              )}
              <TabsTrigger
                value="query"
                className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-medium px-4"
              >
                SQL
              </TabsTrigger>
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
        </Tabs>
      </div>
    </div>
  );
}
