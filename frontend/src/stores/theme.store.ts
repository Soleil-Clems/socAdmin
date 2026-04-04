import { create } from "zustand";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "socadmin_theme";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  } else {
    root.classList.toggle("dark", theme === "dark");
  }
}

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

// Apply on load
const initial = getInitialTheme();
applyTheme(initial);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
}));

// Listen to system preference changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { theme } = useThemeStore.getState();
  if (theme === "system") applyTheme("system");
});
