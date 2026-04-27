// @soleil-clems: Component - Auth brand panel
import { Database, Terminal, Table, ChevronRight, Search, MoreHorizontal, Download, Filter, X, Zap, ChevronLeft } from "lucide-react";

function MockAppPreview() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden shadow-2xl shadow-black/30">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/8 bg-white/[0.02]">
        <div className="w-2.5 h-2.5 rounded-full bg-primary/50" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <div className="ml-3 flex-1 h-5 rounded-md bg-white/[0.05] flex items-center px-2">
          <Search className="w-2.5 h-2.5 text-white/20" />
          <span className="ml-1.5 text-[9px] text-white/20 font-mono">localhost:8080</span>
        </div>
      </div>

      <div className="flex h-[310px]">
        {/* Sidebar */}
        <div className="w-[130px] border-r border-white/8 bg-white/[0.02] py-2 flex flex-col">
          <div className="px-3 mb-2">
            <span className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">Databases</span>
          </div>

          {/* MySQL connection */}
          <div className="px-2 mb-1">
            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-primary/10">
              <div className="w-3.5 h-3.5 rounded bg-primary/25 flex items-center justify-center">
                <Database className="w-2 h-2 text-primary" />
              </div>
              <span className="text-[10px] text-white/80 font-medium truncate">ecommerce</span>
            </div>
          </div>

          {/* Tables list */}
          <div className="px-2 space-y-0.5">
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] text-primary/70 bg-primary/[0.06]">
              <Table className="w-2.5 h-2.5" />
              <span>users</span>
              <span className="ml-auto text-[8px] text-white/20">1.2k</span>
            </div>
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] text-white/40">
              <Table className="w-2.5 h-2.5 text-white/20" />
              <span>orders</span>
              <span className="ml-auto text-[8px] text-white/15">847</span>
            </div>
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] text-white/40">
              <Table className="w-2.5 h-2.5 text-white/20" />
              <span>products</span>
              <span className="ml-auto text-[8px] text-white/15">156</span>
            </div>
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] text-white/40">
              <Table className="w-2.5 h-2.5 text-white/20" />
              <span>sessions</span>
              <span className="ml-auto text-[8px] text-white/15">3.4k</span>
            </div>
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] text-white/40">
              <Table className="w-2.5 h-2.5 text-white/20" />
              <span>payments</span>
              <span className="ml-auto text-[8px] text-white/15">621</span>
            </div>
          </div>

          {/* PostgreSQL connection */}
          <div className="px-2 mt-3 mb-1">
            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md">
              <div className="w-3.5 h-3.5 rounded bg-white/10 flex items-center justify-center">
                <Database className="w-2 h-2 text-white/30" />
              </div>
              <span className="text-[10px] text-white/40 truncate">analytics</span>
              <ChevronRight className="w-2.5 h-2.5 text-white/15 ml-auto" />
            </div>
          </div>

          {/* MongoDB */}
          <div className="px-2 mb-1">
            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md">
              <div className="w-3.5 h-3.5 rounded bg-white/10 flex items-center justify-center">
                <Database className="w-2 h-2 text-white/30" />
              </div>
              <span className="text-[10px] text-white/40 truncate">logs_db</span>
              <ChevronRight className="w-2.5 h-2.5 text-white/15 ml-auto" />
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tabs */}
          <div className="flex items-center border-b border-white/8 bg-white/[0.02]">
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-primary text-[10px] text-white/70 font-medium">
              <Table className="w-2.5 h-2.5 text-primary/70" />
              users
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-white/30">
              <Terminal className="w-2.5 h-2.5" />
              Query 1
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/8 bg-white/[0.015]">
            <span className="text-[9px] text-white/20">1,247 rows</span>

            {/* Active filter */}
            <div className="flex items-center gap-1 h-4 px-1.5 rounded bg-primary/10 border border-primary/20">
              <Filter className="w-2.5 h-2.5 text-primary/60" />
              <span className="text-[8px] text-primary/70">role = admin</span>
              <X className="w-2.5 h-2.5 text-white/25 cursor-pointer" />
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <div className="h-5 px-2 rounded bg-primary/15 border border-primary/25 flex items-center">
                <span className="text-[9px] text-primary font-medium">+ Insert</span>
              </div>
              <div className="h-5 px-1.5 rounded bg-white/[0.05] border border-white/10 flex items-center gap-1">
                <Download className="w-2.5 h-2.5 text-white/30" />
                <span className="text-[9px] text-white/30">Export</span>
              </div>
              <div className="h-5 w-5 rounded bg-white/[0.05] border border-white/10 flex items-center justify-center">
                <MoreHorizontal className="w-3 h-3 text-white/30" />
              </div>
            </div>
          </div>

          {/* Data grid */}
          <div className="flex-1 overflow-hidden">
            <table className="w-full text-[9px] font-mono">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="text-left px-2.5 py-1.5 text-white/30 font-medium w-8">
                    id <span className="text-white/15 font-normal">INT</span>
                  </th>
                  <th className="text-left px-2.5 py-1.5 text-white/30 font-medium">
                    name <span className="text-white/15 font-normal">VARCHAR</span>
                  </th>
                  <th className="text-left px-2.5 py-1.5 text-white/30 font-medium">
                    email <span className="text-white/15 font-normal">VARCHAR</span>
                  </th>
                  <th className="text-left px-2.5 py-1.5 text-white/30 font-medium">
                    role <span className="text-white/15 font-normal">ENUM</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5 bg-primary/[0.04]">
                  <td className="px-2.5 py-1.5 text-primary/60">1</td>
                  <td className="px-2.5 py-1.5 text-white/70">Alice Martin</td>
                  <td className="px-2.5 py-1.5 text-white/40">alice@mail.com</td>
                  <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary/80 text-[8px]">admin</span></td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="px-2.5 py-1.5 text-white/25">2</td>
                  <td className="px-2.5 py-1.5 text-white/70">Bob Chen</td>
                  <td className="px-2.5 py-1.5 text-white/40">bob@mail.com</td>
                  <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 text-[8px]">user</span></td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="px-2.5 py-1.5 text-white/25">3</td>
                  <td className="px-2.5 py-1.5 text-white/70">Clara Diaz</td>
                  <td className="px-2.5 py-1.5 text-white/40">clara@mail.com</td>
                  <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 text-[8px]">user</span></td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="px-2.5 py-1.5 text-white/25">4</td>
                  <td className="px-2.5 py-1.5 text-white/70">David Lee</td>
                  <td className="px-2.5 py-1.5 text-white/40">david@mail.com</td>
                  <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 text-[8px]">user</span></td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="px-2.5 py-1.5 text-white/25">5</td>
                  <td className="px-2.5 py-1.5 text-white/70">Eva Santos</td>
                  <td className="px-2.5 py-1.5 text-white/40">eva@mail.com</td>
                  <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary/80 text-[8px]">admin</span></td>
                </tr>
                <tr>
                  <td className="px-2.5 py-1.5 text-white/25">6</td>
                  <td className="px-2.5 py-1.5 text-white/70">Finn Müller</td>
                  <td className="px-2.5 py-1.5 text-white/40">finn@mail.com</td>
                  <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 text-[8px]">user</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-3 py-1 border-t border-white/8 bg-white/[0.02]">
            <span className="text-[8px] text-white/20 font-mono">Showing 1-50 of 1,247</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-white/[0.05] flex items-center justify-center">
                <ChevronLeft className="w-2.5 h-2.5 text-white/20" />
              </div>
              <div className="w-4 h-4 rounded bg-primary/15 flex items-center justify-center">
                <span className="text-[8px] text-primary/80 font-medium">1</span>
              </div>
              <div className="w-4 h-4 rounded bg-white/[0.05] flex items-center justify-center">
                <span className="text-[8px] text-white/25">2</span>
              </div>
              <div className="w-4 h-4 rounded bg-white/[0.05] flex items-center justify-center">
                <span className="text-[8px] text-white/25">3</span>
              </div>
              <div className="w-4 h-4 rounded bg-white/[0.05] flex items-center justify-center">
                <ChevronRight className="w-2.5 h-2.5 text-white/20" />
              </div>
            </div>
          </div>

          {/* Query bar at bottom */}
          <div className="border-t border-white/8 px-3 py-1.5 bg-white/[0.02]">
            <div className="font-mono text-[9px] text-white/30">
              <span className="text-primary/70">SELECT</span> * <span className="text-primary/70">FROM</span> users <span className="text-primary/70">WHERE</span> role = <span className="text-white/50">'admin'</span> <span className="text-primary/70">LIMIT</span> <span className="text-white/50">50</span><span className="animate-pulse text-primary">|</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-white/8 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
            <span className="text-[8px] text-white/30">MySQL 8.0 — ecommerce</span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="w-2.5 h-2.5 text-white/15" />
            <span className="text-[8px] text-white/20">4ms</span>
          </div>
        </div>
        <span className="text-[8px] text-white/15">UTF-8</span>
      </div>
    </div>
  );
}

export function AuthBrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[580px] bg-[oklch(0.13_0.005_260)] text-white flex-col justify-between p-10 relative overflow-hidden">
      {/* Rose glows */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-primary/8 blur-3xl" />
      <div className="absolute top-1/3 right-1/4 w-48 h-48 rounded-full bg-primary/6 blur-3xl" />

      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <img src="/logo-dark.png" alt="socAdmin" className="h-10 w-10 object-contain" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              soc<span className="text-primary">Admin</span>
            </h1>
            <p className="text-sm text-white/40 mt-1">Database administration</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 space-y-5">
        <MockAppPreview />

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] text-white/60">
            <Database className="w-3 h-3 text-primary/70" /> MySQL
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] text-white/60">
            <Database className="w-3 h-3 text-primary/70" /> PostgreSQL
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] text-white/60">
            <Database className="w-3 h-3 text-primary/70" /> MongoDB
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[11px] text-white/50">
            <Terminal className="w-3 h-3" /> Queries
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[11px] text-white/50">
            <Download className="w-3 h-3" /> Export
          </div>
        </div>
      </div>

      <p className="relative z-10 text-xs text-white/25">v1.0</p>
    </div>
  );
}
