import Sidebar from "@/components/layout/sidebar";
import TableView from "@/pages/dashboard/table-view";
import QueryEditor from "@/pages/dashboard/query-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DashboardPage() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs defaultValue="data" className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-border px-4">
            <TabsList className="h-10">
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="query">SQL Query</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="data" className="flex-1 overflow-hidden m-0">
            <TableView />
          </TabsContent>
          <TabsContent value="query" className="flex-1 overflow-hidden m-0">
            <QueryEditor />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
