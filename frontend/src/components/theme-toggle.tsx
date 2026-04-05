import { useThemeStore } from "@/stores/theme.store";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useThemeStore();
  const next =
    theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const label =
    theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-8 text-xs gap-1.5 ${className ?? ""}`}
      onClick={() => setTheme(next)}
      title={`Theme: ${theme}`}
    >
      <span className="w-3.5 h-3.5 rounded-full border border-current inline-flex items-center justify-center text-[8px]">
        {theme === "light" ? "☀" : theme === "dark" ? "☽" : "◐"}
      </span>
      {label}
    </Button>
  );
}
