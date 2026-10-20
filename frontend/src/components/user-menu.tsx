// @soleil-clems: Component - User menu popover (sidebar footer)
import { useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useNavigationStore } from "@/stores/navigation.store";
import { databaseRequest } from "@/requests/database.request";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import ChangePasswordDialog from "@/components/change-password-dialog";

export default function UserMenu() {
  const email = useAuthStore((s) => s.email);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const resetNav = useNavigationStore((s) => s.reset);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    databaseRequest.disconnect().catch(() => {});
    resetNav();
    disconnect();
    logout();
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-sidebar-accent/50 transition-colors"
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
              isAdmin ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <span className="text-[11px] text-sidebar-foreground/70 truncate min-w-0 flex-1">
            {email || (isAdmin ? "Admin" : "Read-only")}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sidebar-foreground/30 shrink-0" aria-hidden="true">
            <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
          </svg>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-56">
          <div className="px-2 py-1.5 border-b border-border/50 mb-1">
            <p className="text-xs font-medium text-foreground truncate">{email}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {isAdmin ? "Admin" : "Read-only"}
            </p>
          </div>
          <button
            onClick={() => { setShowChangePassword(true); setOpen(false); }}
            className="w-full text-left px-2 py-1.5 rounded text-xs text-popover-foreground/70 hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Change password
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-left px-2 py-1.5 rounded text-xs text-popover-foreground/70 hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Logout
          </button>
        </PopoverContent>
      </Popover>

      <ChangePasswordDialog open={showChangePassword} onOpenChange={setShowChangePassword} />
    </>
  );
}
