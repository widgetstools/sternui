import { ThemeProvider as NextThemesProvider } from "next-themes";

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  attribute?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'stern-theme',
  enableSystem = true,
  disableTransitionOnChange = false,
  attribute = 'class',
  ...props
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      storageKey={storageKey}
      disableTransitionOnChange={disableTransitionOnChange}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

// Re-export useTheme for convenience
export { useTheme } from "next-themes";
