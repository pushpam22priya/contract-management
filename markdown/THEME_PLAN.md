# Theme Implementation Plan — Light / Dark / Coffee

## Current State

The project uses **MUI v7** with a single hardcoded `light` theme defined in `src/theme/theme.ts`.
It is imported directly into `src/app/layout.tsx` and passed to `ThemeProvider` — no switching mechanism exists.

Key things already in place that we build on:
- Custom `sidebar` extension on the MUI `Theme` interface
- `AppRouterCacheProvider` already wraps the app (required for MUI + Next.js App Router)
- `next-intl`'s `NextIntlClientProvider` is already nested inside `ThemeProvider`

---

## Why Each Step Exists

| Step | What | Why |
|------|------|-----|
| 1 | Define 3 theme objects | Each theme needs its own palette, sidebar colors, and typography overrides |
| 2 | Create `ThemeContext` | A React context holds the active theme name and the setter — this is the single source of truth |
| 3 | Create `ThemeRegistry` | A client component that reads from `localStorage`, wraps children with dynamic `ThemeProvider`, and exposes the context |
| 4 | Update `layout.tsx` | Replace the static `ThemeProvider` with `ThemeRegistry` |
| 5 | Create `ThemeToggle` component | Three-way toggle button (like LanguageToggle) placed in the Header |
| 6 | Update `Header.tsx` | Add `ThemeToggle` next to `LanguageToggle` |
| 7 | Handle SSR flash | Read theme from a cookie server-side so the first render matches the user's choice |

---

## Key Terms

| Term | Meaning |
|------|---------|
| `ThemeContext` | React context that stores `{ themeName, setThemeName }` — any component can read or change the active theme |
| `ThemeRegistry` | Client component that wraps `ThemeProvider` with the dynamic theme object; also owns `localStorage` persistence |
| `useThemeName()` | Custom hook that reads from `ThemeContext` — shorthand for components that need to know the active theme |
| `NEXT_THEME` cookie | Cookie set client-side (like `NEXT_LOCALE`), read server-side to avoid a white flash on first paint |
| MUI `palette.mode` | `'light'` or `'dark'` — tells MUI which contrast defaults to apply (text colors, dividers, etc.) |
| Custom `sidebar` token | Extended theme property we already have — needs its own value per theme |

---

## 3 Theme Palettes

### 1. Light (current — `#0f766e` teal base)

```
palette.mode            light
primary.main            #0f766e  (teal)
primary.dark            #0d5f57
background.default      #f1f5f9  (slate-100)
background.paper        #ffffff
text.primary            #1e293b  (slate-800)
text.secondary          #475569  (slate-600)
sidebar.background      #0f766e
sidebar.hover           #d1fae5
sidebar.selected        #ffffff
sidebar.unselected      #ffffff
```

### 2. Dark (`#0f766e` teal on deep navy)

```
palette.mode            dark
primary.main            #2dd4bf  (teal-300 — lighter for dark bg contrast)
primary.dark            #0f766e
background.default      #0f172a  (slate-900)
background.paper        #1e293b  (slate-800)
text.primary            #f1f5f9  (slate-100)
text.secondary          #94a3b8  (slate-400)
sidebar.background      #020617  (slate-950)
sidebar.hover           rgba(45,212,191,0.12)
sidebar.selected        #2dd4bf
sidebar.unselected      #94a3b8
```

### 3. Coffee (warm espresso & cream)

```
palette.mode            light
primary.main            #6f4e37  (coffee brown)
primary.dark            #4e3728
primary.light           #d4a97440 (warm amber tint)
background.default      #faf3e0  (cream)
background.paper        #fff8ee  (warm white)
text.primary            #2c1810  (dark espresso)
text.secondary          #7c5c44  (medium brown)
sidebar.background      #3b2314  (dark espresso)
sidebar.hover           rgba(111,78,55,0.18)
sidebar.selected        #f5e6d3  (light cream)
sidebar.unselected      #c4a882  (warm tan)
divider                 #e6d5c3  (warm beige)
```

---

## File Changes

| File | Action | What changes |
|------|--------|-------------|
| `src/theme/theme.ts` | Rewrite | Export 3 named theme objects (`lightTheme`, `darkTheme`, `coffeeTheme`) and a `themeMap` lookup |
| `src/context/ThemeContext.tsx` | Create new | `ThemeContext`, `ThemeProvider` wrapper component, `useThemeName` hook |
| `src/components/layout/ThemeToggle.tsx` | Create new | Three-way toggle: ☀ Light · 🌙 Dark · ☕ Coffee |
| `src/app/layout.tsx` | Update | Replace static `ThemeProvider theme={theme}` with `<ThemeRegistry>` |
| `src/components/layout/Header.tsx` | Update | Add `<ThemeToggle />` next to `<LanguageToggle />` |

> No changes needed to Sidebar, pages, or other components — they already use `theme.palette.*` and `theme.sidebar.*` tokens, so they adapt automatically.

---

## Implementation

### Step 1 — `src/theme/theme.ts` (rewrite)

Export three separate theme objects sharing the same component overrides, plus a `themeMap` for lookup.

```ts
'use client';
import { createTheme, Theme } from '@mui/material/styles';
import { Roboto } from 'next/font/google';

const roboto = Roboto({ weight: ['300','400','500','700'], subsets: ['latin'], display: 'swap' });

// ── Shared component overrides (same for all themes) ──────────────────────────
const sharedComponents = {
  MuiButton: {
    styleOverrides: {
      root: {
        textTransform: 'none' as const,
        borderRadius: 8,
        padding: '10px 20px',
        fontWeight: 600,
        boxShadow: 'none',
        '&:hover': { boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
      },
    },
  },
  MuiTextField: {
    styleOverrides: { root: { '& .MuiOutlinedInput-root': { borderRadius: 8 } } },
  },
  MuiCard: {
    styleOverrides: {
      root: { borderRadius: 16, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' },
    },
  },
};

// ── Light ─────────────────────────────────────────────────────────────────────
export const lightTheme = createTheme({
  typography: { fontFamily: roboto.style.fontFamily },
  palette: {
    mode: 'light',
    primary: { main: '#0f766e', dark: '#0d5f57', light: '#c2ffbf70' },
    secondary: { main: '#64748b' },
    background: { default: '#f1f5f9', paper: '#ffffff' },
  },
  sidebar: {
    background: '#0f766e',
    hover: '#d1fae5',
    selected: '#ffffff',
    unselected: '#ffffff',
  },
  components: sharedComponents,
});

// ── Dark ──────────────────────────────────────────────────────────────────────
export const darkTheme = createTheme({
  typography: { fontFamily: roboto.style.fontFamily },
  palette: {
    mode: 'dark',
    primary: { main: '#2dd4bf', dark: '#0f766e', light: '#99f6e4' },
    secondary: { main: '#94a3b8' },
    background: { default: '#0f172a', paper: '#1e293b' },
  },
  sidebar: {
    background: '#020617',
    hover: 'rgba(45,212,191,0.12)',
    selected: '#2dd4bf',
    unselected: '#94a3b8',
  },
  components: sharedComponents,
});

// ── Coffee ────────────────────────────────────────────────────────────────────
export const coffeeTheme = createTheme({
  typography: { fontFamily: roboto.style.fontFamily },
  palette: {
    mode: 'light',
    primary: { main: '#6f4e37', dark: '#4e3728', light: '#d4a97440' },
    secondary: { main: '#7c5c44' },
    background: { default: '#faf3e0', paper: '#fff8ee' },
    text: { primary: '#2c1810', secondary: '#7c5c44' },
    divider: '#e6d5c3',
  },
  sidebar: {
    background: '#3b2314',
    hover: 'rgba(111,78,55,0.18)',
    selected: '#f5e6d3',
    unselected: '#c4a882',
  },
  components: sharedComponents,
});

// ── Lookup map ────────────────────────────────────────────────────────────────
export type ThemeName = 'light' | 'dark' | 'coffee';

export const themeMap: Record<ThemeName, Theme> = {
  light: lightTheme,
  dark: darkTheme,
  coffee: coffeeTheme,
};

// Default export kept for any legacy imports
export default lightTheme;
```

---

### Step 2 — `src/context/ThemeContext.tsx` (new file)

```tsx
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeName, themeMap } from '@/theme/theme';

// ── Context ───────────────────────────────────────────────────────────────────
interface ThemeContextValue {
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeName: 'light',
  setThemeName: () => {},
});

export const useThemeName = () => useContext(ThemeContext);

// ── Registry / Provider ───────────────────────────────────────────────────────
// This replaces the static ThemeProvider in layout.tsx.
// It reads the saved theme from localStorage on mount and persists changes.
// Also sets a cookie so the server can read it on next load (prevents flash).

export function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>('light');

  // Hydrate from localStorage on first client render
  useEffect(() => {
    const saved = localStorage.getItem('NEXT_THEME') as ThemeName | null;
    if (saved && saved in themeMap) {
      setThemeNameState(saved);
    }
  }, []);

  const setThemeName = (name: ThemeName) => {
    setThemeNameState(name);
    localStorage.setItem('NEXT_THEME', name);
    // Also set cookie so server-side layout can read it
    document.cookie = `NEXT_THEME=${name}; path=/; max-age=31536000; SameSite=Lax`;
  };

  return (
    <ThemeContext.Provider value={{ themeName, setThemeName }}>
      <MuiThemeProvider theme={themeMap[themeName]}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
```

---

### Step 3 — `src/components/layout/ThemeToggle.tsx` (new file)

A three-way toggle styled like the existing `LanguageToggle` — sliding pill indicator.

```tsx
'use client';

import { Box, Tooltip } from '@mui/material';
import { useThemeName, ThemeName } from '@/context/ThemeContext';  // re-export ThemeName from here

const themes: { name: ThemeName; label: string; tooltip: string }[] = [
  { name: 'light', label: '☀',  tooltip: 'Light mode'  },
  { name: 'dark',  label: '🌙', tooltip: 'Dark mode'   },
  { name: 'coffee',label: '☕', tooltip: 'Coffee mode' },
];

export default function ThemeToggle() {
  const { themeName, setThemeName } = useThemeName();
  const activeIdx = themes.findIndex(t => t.name === themeName);

  return (
    <Tooltip title={themes[activeIdx].tooltip} arrow placement="bottom">
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'rgba(0,0,0,0.06)',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '20px',
          height: 26,
          p: '2px',
          userSelect: 'none',
          gap: 0,
        }}
      >
        {/* Sliding indicator pill */}
        <Box
          sx={{
            position: 'absolute',
            top: 2,
            left: `calc(${activeIdx} * (100% / 3) + 2px)`,
            width: 'calc(100% / 3 - 4px)',
            height: 'calc(100% - 4px)',
            bgcolor: 'primary.main',
            borderRadius: '14px',
            transition: 'left 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            zIndex: 0,
          }}
        />
        {themes.map((t, idx) => (
          <Box
            key={t.name}
            onClick={() => setThemeName(t.name)}
            sx={{
              position: 'relative',
              zIndex: 1,
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              px: 0.75,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: themeName === t.name ? 'white' : 'text.secondary',
              transition: 'color 0.2s',
            }}
          >
            {t.label}
          </Box>
        ))}
      </Box>
    </Tooltip>
  );
}
```

---

### Step 4 — `src/app/layout.tsx` (update)

Remove the static `ThemeProvider` + `CssBaseline` import, replace with `ThemeRegistry`.

**Before:**
```tsx
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '../theme/theme';
...
<ThemeProvider theme={theme}>
  <CssBaseline />
  <NextIntlClientProvider ...>
    <AppInitializer>{children}</AppInitializer>
  </NextIntlClientProvider>
</ThemeProvider>
```

**After:**
```tsx
import { ThemeRegistry } from '@/context/ThemeContext';
...
<ThemeRegistry>
  <NextIntlClientProvider ...>
    <AppInitializer>{children}</AppInitializer>
  </NextIntlClientProvider>
</ThemeRegistry>
```

> `CssBaseline` moves inside `ThemeRegistry` — it always renders alongside `MuiThemeProvider`.

---

### Step 5 — `src/components/layout/Header.tsx` (update)

Add `ThemeToggle` next to the existing `LanguageToggle`:

```tsx
import ThemeToggle from './ThemeToggle';
...
<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
  <ThemeToggle />          {/* ← add this */}
  <LanguageToggle />
  <Tooltip title={t('notifications')} ...>...</Tooltip>
  <Tooltip title={t('logout')} ...>...</Tooltip>
</Box>
```

---

## SSR Flash Prevention (Optional — Phase 2)

On first server render, React doesn't know the user's theme choice, so `light` is always rendered.
If the cookie approach is added:

1. In `layout.tsx` (async server component), read `cookies().get('NEXT_THEME')?.value`
2. Pass it as `defaultTheme` prop to `ThemeRegistry`
3. `ThemeRegistry` uses it as initial `useState` value instead of always `'light'`

This prevents a brief flash to light mode when the user prefers dark/coffee.
It is the same pattern used for `NEXT_LOCALE`.

---

## What Adapts Automatically

Because all existing components use `theme.palette.*` and `theme.sidebar.*` tokens rather than hardcoded hex values, the following all adapt with zero extra changes:

- Sidebar background, hover, selected colors
- All `Paper`, `Card`, `TextField`, `Button` components
- `text.primary` / `text.secondary` everywhere
- `divider` colors
- `bgcolor: 'background.default'` and `bgcolor: 'background.paper'`

### What May Need Manual Review

Some components use hardcoded hex colors for status badges and banners (e.g. `#fef2f2`, `#d1fae5`).
These are intentional semantic colors (red for error, green for success) and look fine on all three themes.
Only if a component uses hardcoded grays for general UI backgrounds would it need updating.

---

## Implementation Order

1. Rewrite `src/theme/theme.ts`
2. Create `src/context/ThemeContext.tsx`
3. Create `src/components/layout/ThemeToggle.tsx`
4. Update `src/app/layout.tsx`
5. Update `src/components/layout/Header.tsx`
6. Test all three themes, check Sidebar and Dashboard cards
7. (Optional) Add SSR flash prevention via cookie read in `layout.tsx`
