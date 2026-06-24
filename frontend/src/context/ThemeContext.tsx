import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";
import { darkColors, lightColors } from "@/src/theme";

type Theme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({} as ThemeContextType);

export const useTheme = () => useContext(ThemeContext);

export function useAppTheme() {
  const { theme, toggleTheme } = useTheme();
  const colors = theme === "light" ? lightColors : darkColors;
  return { theme, colors, toggleTheme };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  const applyTheme = useCallback((t: Theme) => {
    (global as any).activeTheme = t;
    if (Platform.OS === "web") {
      const root = document.documentElement;
      const activeColors = t === "light" ? lightColors : darkColors;
      Object.entries(activeColors).forEach(([key, val]) => {
        root.style.setProperty(`--color-${key}`, val);
      });
    }
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem("roamsync_theme", "dark" as Theme);
      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
        applyTheme(saved);
      } else {
        applyTheme("dark");
      }
    })();
  }, [applyTheme]);

  const toggleTheme = useCallback(async () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setThemeState(nextTheme);
    await storage.setItem("roamsync_theme", nextTheme);
    applyTheme(nextTheme);
  }, [theme, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
