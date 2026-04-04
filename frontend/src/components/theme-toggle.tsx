import { useThemeStore } from "@/stores/theme.store";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useThemeStore();
  const next =
    theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const icon = theme === "light" ? "\u2600" : theme === "dark" ? "\u263E" : "\u25D0";

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => setTheme(next)}
      title={`Theme: ${theme}`}
    >
      {icon}
    </Button>
  );
}
