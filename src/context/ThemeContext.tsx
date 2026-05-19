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
    setThemeName: () => { },
});

export const useThemeName = () => useContext(ThemeContext);

// Re-export ThemeName so toggle component can import from one place
export type { ThemeName };

// ── Per-theme body background config ─────────────────────────────────────────
// Inline styles on document.body have the highest CSS specificity and cannot
// be overridden by MUI's CssBaseline background-color rule.

interface BodyBg {
    backgroundImage?: string;
    backgroundSize?: string;
    backgroundPosition?: string;
    backgroundAttachment?: string;
    backgroundRepeat?: string;
    backgroundColor?: string;
}

const bodyBgMap: Record<ThemeName, BodyBg> = {
    light: {
        backgroundImage: 'none',
        backgroundColor: '#f1f5f9',
    },
    dark: {
        backgroundImage: 'none',
        backgroundColor: '#0f172a',
    },
    coffee: {
        backgroundImage: 'none',
        backgroundColor: '#faf3e0',
    },
    ocean: {
        backgroundImage: 'url("/images/oceanBackground.jpg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#ddeef8', // shown while image loads
    },
    sunrise: {
        backgroundImage: 'none',
        backgroundColor: '#fdf5e6', 
    },
    forest: {
        backgroundImage: 'none',
        backgroundColor: '#f1f6f1',
    },
    water: {
        backgroundImage: 'none',
        backgroundColor: '#f1fbfd',
    },
};

function applyBodyBg(bg: BodyBg) {
    const b = document.body;
    b.style.backgroundImage = bg.backgroundImage ?? '';
    b.style.backgroundSize = bg.backgroundSize ?? '';
    b.style.backgroundPosition = bg.backgroundPosition ?? '';
    b.style.backgroundAttachment = bg.backgroundAttachment ?? '';
    b.style.backgroundRepeat = bg.backgroundRepeat ?? '';
    b.style.backgroundColor = bg.backgroundColor ?? '';
}

// ── Registry / Provider ───────────────────────────────────────────────────────
export function ThemeRegistry({
    children,
    defaultTheme = 'light',
}: {
    children: React.ReactNode;
    defaultTheme?: ThemeName;
}) {
    const [themeName, setThemeNameState] = useState<ThemeName>(defaultTheme);

    // Apply body background immediately whenever theme changes
    useEffect(() => {
        applyBodyBg(bodyBgMap[themeName]);
    }, [themeName]);

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
