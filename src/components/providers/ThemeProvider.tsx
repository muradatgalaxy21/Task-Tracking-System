"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

export type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "aib_theme";

function applyTheme(t: Theme) {
  // Apply dark class to html element for body-level CSS overrides.
  document.documentElement.classList.toggle("dark", t === "dark");
  localStorage.setItem(STORAGE_KEY, t);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // On mount, read the stored preference and sync both React state and the
  // html element class. The anti-flash script handles the very first paint,
  // but this effect ensures the state is correct after hydration and on
  // subsequent mounts (e.g., if the layout re-mounts during navigation).
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const resolved: Theme = stored === "dark" ? "dark" : "light";
    setThemeState(resolved);
    applyTheme(resolved);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
  };

  // The wrapper div carries the "dark" class directly as a React-managed prop.
  // This guarantees React controls the element — no reliance on external DOM
  // mutations surviving hydration. display:contents removes layout impact.
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={theme === "dark" ? "dark" : ""} style={{ display: "contents" }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
