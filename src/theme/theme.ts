'use client';
import { createTheme, Theme } from '@mui/material/styles';

declare module '@mui/material/styles' {
    interface Theme {
        sidebar: {
            background: string;
            hover: string;
            selected: string;
            selectedItemBg: string;
            unselected: string;
            selectedGradient?: string;
            selectedGradientHover?: string;
            accentGradient?: string;
            cardHoverGradient?: string;
            itemFontSize: string;
            itemFontWeight: number;
            itemFontWeightSelected: number;
        };
        shimmer: {
            base: string;
            highlight: string;
        };
        card: {
            actionOverlay: string;
        };
        login: {
            /** Full-page wrapper gradient / background */
            pageBackground: string;
            /** Left branding panel gradient */
            leftPanelBackground: string;
            /** Right form panel background */
            rightPanelBackground: string;
            /** Right panel text colour */
            rightPanelText: string;
            /** Sign-in button background */
            buttonBackground: string;
            /** Sign-in button hover background */
            buttonHover: string;
            /** Sign-in button disabled background */
            buttonDisabled: string;
        };
    }
    interface ThemeOptions {
        sidebar?: {
            background?: string;
            hover?: string;
            selected?: string;
            selectedItemBg?: string;
            unselected?: string;
            selectedGradient?: string;
            selectedGradientHover?: string;
            accentGradient?: string;
            cardHoverGradient?: string;
            itemFontSize?: string;
            itemFontWeight?: number;
            itemFontWeightSelected?: number;
        };
        shimmer?: {
            base?: string;
            highlight?: string;
        };
        card?: {
            actionOverlay?: string;
        };
        login?: {
            pageBackground?: string;
            leftPanelBackground?: string;
            rightPanelBackground?: string;
            rightPanelText?: string;
            buttonBackground?: string;
            buttonHover?: string;
            buttonDisabled?: string;
        };
    }
}

export type ThemeName = 'light' | 'dark' | 'coffee' | 'ocean' | 'sunrise' | 'forest' | 'water';

// ── Shared component overrides (identical across all themes) ──────────────────
const sharedComponents = {
    MuiButton: {
        styleOverrides: {
            root: {
                textTransform: 'none' as const,
                borderRadius: 8,
                padding: '10px 20px',
                fontWeight: 600,
                boxShadow: 'none',
                '&:hover': {
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                },
            },
        },
    },
    MuiTextField: {
        styleOverrides: {
            root: {
                '& .MuiOutlinedInput-root': {
                    borderRadius: 8,
                },
            },
        },
    },
    MuiCard: {
        styleOverrides: {
            root: {
                borderRadius: 16,
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
            },
        },
    },
    MuiTypography: {
        styleOverrides: {
            h4: ({ theme }: { theme: Theme }) => ({
                fontSize: '1.5rem',
                fontWeight: 700,
                color: theme.palette.primary.main,
            }),
            h5: ({ theme }: { theme: Theme }) => ({
                fontSize: '1rem',
                fontWeight: 600,
                color: theme.palette.primary.main,
            }),
            h6: ({ theme }: { theme: Theme }) => ({
                fontSize: '0.9rem',
                fontWeight: 600,
                color: theme.palette.text.primary,
            }),
            caption: ({ theme }: { theme: Theme }) => ({
                fontSize: '0.72rem',
                fontWeight: 400,
                color: theme.palette.text.secondary,
            }),
            subtitle2: ({ theme }: { theme: Theme }) => ({
                fontSize: '0.8rem',
                fontWeight: 600,
                color: theme.palette.text.primary,
            }),
            body2: ({ theme }: { theme: Theme }) => ({
                fontSize: '0.75rem',
                fontWeight: 400,
                color: theme.palette.text.secondary,
            }),
        },
    },
    MuiMenuItem: {
        styleOverrides: {
            root: ({ theme }: { theme: Theme }) => ({
                fontSize: '0.8rem',
                fontWeight: 400,
                color: theme.palette.text.primary,
            }),
        },
    },
    MuiAutocomplete: {
        styleOverrides: {
            option: ({ theme }: { theme: Theme }) => ({
                fontSize: '0.8rem',
                fontWeight: 400,
                color: theme.palette.text.primary,
            }),
            noOptions: ({ theme }: { theme: Theme }) => ({
                fontSize: '0.8rem',
                color: theme.palette.text.secondary,
            }),
            paper: ({ theme }: { theme: Theme }) => ({
                ...(theme.palette.mode === 'dark' && {
                    backgroundColor: '#182030',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                    border: '1px solid rgba(255,255,255,0.10)',
                }),
            }),
        },
    },
    MuiChip: {
        styleOverrides: {
            label: {
                fontSize: '0.72rem',
                fontWeight: 500,
            },
        },
    },
    MuiDialogTitle: {
        styleOverrides: {
            root: ({ theme }: { theme: Theme }) => ({
                fontSize: '1rem',
                fontWeight: 400,
                color: theme.palette.text.primary,
            }),
        },
    },
    MuiDialogContent: {
        styleOverrides: {
            root: ({ theme }: { theme: Theme }) => ({
                '& .MuiTypography-body2': {
                    color: theme.palette.mode === 'dark' ? '#94a3b8' : '#64748b',
                },
            }),
        },
    },
};

// ── Light ─────────────────────────────────────────────────────────────────────
export const lightTheme = createTheme({
    typography: {
        fontFamily:  "'Inter', sans-serif",
        h4: { fontWeight: 700, color: '#1e293b' },
        body1: { color: '#475569' },
    },
    palette: {
        mode: 'light',
        primary: {
            main: '#0f766e',
            dark: '#0d5f57',
            light: '#c2ffbf70',
        },
        secondary: { main: '#64748b' },
        background: {
            default: '#f1f5f9',
            paper: '#fafafa',
        },
        success: { main: '#0f766e', light: '#f0fdfa', dark: '#064e3b' },
        error:   { main: '#dc2626', light: '#fef2f2', dark: '#991b1b' },
    },
    sidebar: {
        background: '#0f766e',
        hover: 'rgba(255,255,255,0.10)',
        selected: '#ffffff',
        selectedItemBg: 'rgba(0,0,0,0.22)',
        unselected: 'rgba(255,255,255,0.75)',
        cardHoverGradient: 'linear-gradient(90deg, #0d5f57 0%, #0f766e 50%, #34d399 100%)',
        itemFontSize: '0.82rem',
        itemFontWeight: 400,
        itemFontWeightSelected: 600,
    },
    shimmer: {
        base: '#f1f5f9',
        highlight: '#e2e8f0',
    },
    card: {
        actionOverlay: '#fafafa',
    },
    login: {
        pageBackground: 'linear-gradient(135deg, #129191ff 0%, #115e59 50%, #134e4a 100%)',
        leftPanelBackground: 'linear-gradient(135deg, #0f766e 0%, #115e59 50%, #134e4a 100%)',
        rightPanelBackground: '#f0fff7ff',
        rightPanelText: '#1e293b',
        buttonBackground: '#115e59',
        buttonHover: '#0f4c47',
        buttonDisabled: '#115e5980',
    },
    components: sharedComponents,
});

// ── Dark ──────────────────────────────────────────────────────────────────────
export const darkTheme = createTheme({
    typography: {
        fontFamily:  "'Inter', sans-serif",
        h4: { fontWeight: 700, color: '#f1f5f9' },
        body1: { color: '#94a3b8' },
    },
    palette: {
        mode: 'dark',
        primary: {
            main: '#8474b4',    // muted violet — calm, non-glaring accent
            dark: '#6e5fa3',    // slightly darker violet — hover state
            light: '#c0b4e0',   // soft lavender — subtle highlights
        },
        secondary: { main: '#94a3b8' },
        background: {
            default: 'transparent',
            paper: 'rgba(30,41,59,0.45)',
        },
        text: {
            primary: '#efefefff',
            secondary: '#94a3b8',
        },
        divider: 'rgba(255,255,255,0.10)',
        action: {
            hover: 'rgba(149,133,192,0.08)',
            selected: 'rgba(149,133,192,0.14)',
            active: '#f1f5f9',
            disabled: 'rgba(255,255,255,0.3)',
            disabledBackground: 'rgba(255,255,255,0.08)',
        },
        success: { main: '#34d399', light: 'rgba(52,211,153,0.12)', dark: '#6ee7b7' },
        error:   { main: '#f87171', light: 'rgba(248,113,113,0.12)', dark: '#fca5a5' },
    },
    sidebar: {
        background: '#020617',
        hover: 'rgba(132,116,180,0.10)',
        selected: '#ffffff',                    // white icon/text on filled violet bg
        selectedItemBg: '#8474b4',
        unselected: '#6b7280',
        selectedGradient: '#8474b4',
        selectedGradientHover: '#9585c0',
        accentGradient: 'linear-gradient(180deg, #a78bfa, #7c3aed, #c4b5fd)',
        itemFontSize: '0.82rem',
        itemFontWeight: 400,
        itemFontWeightSelected: 600,
        cardHoverGradient: 'linear-gradient(90deg, #8474b4 0%, #c0b4e0 50%, #8474b4 100%)',
    },
    shimmer: {
        base: 'rgba(255,255,255,0.05)',
        highlight: 'rgba(255,255,255,0.10)',
    },
    card: {
        actionOverlay: '#151f35',
    },
    login: {
        pageBackground: 'linear-gradient(135deg, #020617 0%, #0f172a 40%, #020617 100%)',
        leftPanelBackground: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #020617 100%)',
        rightPanelBackground: 'rgba(15, 23, 42, 0.85)',
        rightPanelText: '#efefefff',
        buttonBackground: '#8474b4',
        buttonHover: '#6e5fa3',
        buttonDisabled: '#8474b480',
    },
    components: {
        ...sharedComponents,
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(30,41,59,0.45)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(2,6,23,0.80)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#182030',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                    border: '1px solid rgba(255,255,255,0.10)',
                },
            },
        },
        MuiPopover: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#182030',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                    border: '1px solid rgba(255,255,255,0.10)',
                },
            },
        },
        MuiMenu: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#182030',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                    border: '1px solid rgba(255,255,255,0.10)',
                },
            },
        },
        MuiAlert: {
            styleOverrides: {
                filledSuccess: {
                    backgroundColor: 'rgba(52,211,153,0.14)',
                    color: '#6ee7b7',
                    border: '1px solid rgba(52,211,153,0.25)',
                    '& .MuiAlert-icon': { color: '#34d399' },
                },
                filledError: {
                    backgroundColor: 'rgba(248,113,113,0.14)',
                    color: '#fca5a5',
                    border: '1px solid rgba(248,113,113,0.25)',
                    '& .MuiAlert-icon': { color: '#f87171' },
                },
                filledWarning: {
                    backgroundColor: 'rgba(251,191,36,0.14)',
                    color: '#fde68a',
                    border: '1px solid rgba(251,191,36,0.25)',
                    '& .MuiAlert-icon': { color: '#fbbf24' },
                },
                filledInfo: {
                    backgroundColor: 'rgba(96,165,250,0.14)',
                    color: '#bfdbfe',
                    border: '1px solid rgba(96,165,250,0.25)',
                    '& .MuiAlert-icon': { color: '#60a5fa' },
                },
            },
        },
    },
});

// ── Coffee ────────────────────────────────────────────────────────────────────
export const coffeeTheme = createTheme({
    typography: {
        fontFamily:  "'Inter', sans-serif",
        h4: { fontWeight: 700, color: '#2c1810' },
        body1: { color: '#7c5c44' },
    },
    palette: {
        mode: 'light',
        primary: {
            main: '#6f4e37',
            dark: '#4e3728',
            light: '#d4a97440',
        },
        secondary: { main: '#7c5c44' },
        background: {
            default: 'transparent',
            paper: '#fafafa',
        },
        text: {
            primary: '#2c1810',
            secondary: '#0000099',
        },
        divider: 'rgba(111,78,55,0.18)',
        action: {
            hover: 'rgba(111,78,55,0.07)',
            selected: 'rgba(111,78,55,0.12)',
            active: '#2c1810',
            disabled: 'rgba(44,24,16,0.3)',
            disabledBackground: 'rgba(44,24,16,0.08)',
        },
        success: { main: '#5a7a40', light: '#f5f9f0', dark: '#3a5228' },
        error:   { main: '#c0392b', light: '#fef5f4', dark: '#8b2519' },
    },
    sidebar: {
        background: '#3b2314',
        hover: 'rgba(200,160,120,0.12)',
        selected: '#f5e6d3',
        selectedItemBg: 'rgba(245,230,211,0.18)',
        unselected: '#c4a882',
        cardHoverGradient: 'linear-gradient(90deg, #4e3728 0%, #6f4e37 50%, #d4a974 100%)',
        itemFontSize: '0.82rem',
        itemFontWeight: 400,
        itemFontWeightSelected: 600,
    },
    shimmer: {
        base: 'rgba(111,78,55,0.07)',
        highlight: 'rgba(111,78,55,0.13)',
    },
    card: {
        actionOverlay: '#fafafa',
    },
    login: {
        pageBackground: 'linear-gradient(135deg, #4e2c0e 0%, #6f4e37 50%, #3b2314 100%)',
        leftPanelBackground: 'linear-gradient(135deg, #3b2314 0%, #5c3520 50%, #4e3728 100%)',
        rightPanelBackground: '#fff8ee',
        rightPanelText: '#2c1810',
        buttonBackground: '#6f4e37',
        buttonHover: '#4e3728',
        buttonDisabled: '#6f4e3780',
    },
    components: {
        ...sharedComponents,
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: '#fafafa',
                    boxShadow: '0 4px 24px rgba(44,24,16,0.10)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(255,248,238,0.88)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                },
            },
        },
    },
});

// ── Ocean ─────────────────────────────────────────────────────────────────────
// Text: #112A46 (dark navy) · Background: #ACC8E5 (steel blue)
export const oceanTheme = createTheme({
    typography: {
        fontFamily:  "'Inter', sans-serif",
        h4: { fontWeight: 700, color: '#112A46' },
        body1: { color: '#2D5F8A' },
    },
    palette: {
        mode: 'light',
        primary: {
            main: '#1A6FA8',   // medium ocean blue — buttons, links, accents
            dark: '#0F4D7A',
            light: '#ACC8E5',
        },
        secondary: { main: '#2D5F8A' },
        background: {
            default: 'transparent',
            paper: '#fafafa',
        },
        text: {
            primary: '#112A46',  // dark navy
            secondary: '#00000099',
        },
        divider: 'rgba(17,42,70,0.15)',
        action: {
            hover: 'rgba(17,42,70,0.06)',
            selected: 'rgba(26,111,168,0.12)',
            active: '#112A46',
            disabled: 'rgba(17,42,70,0.3)',
            disabledBackground: 'rgba(17,42,70,0.08)',
        },
        success: { main: '#0e7490', light: '#ecfeff', dark: '#155e75' },
        error:   { main: '#dc2626', light: '#fef2f2', dark: '#991b1b' },
    },
    sidebar: {
        background: '#0D2035',
        hover: 'rgba(172,200,229,0.12)',
        selected: '#ACC8E5',
        selectedItemBg: 'rgba(172,200,229,0.18)',
        unselected: 'rgba(172,200,229,0.65)',
        cardHoverGradient: 'linear-gradient(90deg, #0F4D7A 0%, #1A6FA8 50%, #ACC8E5 100%)',
        itemFontSize: '0.82rem',
        itemFontWeight: 400,
        itemFontWeightSelected: 600,
    },
    shimmer: {
        base: 'rgba(17,42,70,0.07)',
        highlight: 'rgba(17,42,70,0.13)',
    },
    card: {
        actionOverlay: '#fafafa',
    },
    login: {
        pageBackground: 'linear-gradient(135deg, #052240 0%, #0a3a6b 50%, #0D2035 100%)',
        leftPanelBackground: 'linear-gradient(135deg, #0D2035 0%, #0F4D7A 50%, #1A6FA8 100%)',
        rightPanelBackground: '#eaf4fc',
        rightPanelText: '#112A46',
        buttonBackground: '#1A6FA8',
        buttonHover: '#0F4D7A',
        buttonDisabled: '#1A6FA880',
    },
    components: {
        ...sharedComponents,
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: '#fafafa',
                    boxShadow: '0 4px 24px rgba(17,42,70,0.10)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(235,248,255,0.88)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                },
            },
        },
    },
});

// ── Sunrise ───────────────────────────────────────────────────────────────────
// Text: #2b1812 (dark warm brown) · Background: #fdf5e6 (old lace / warm white)
export const sunriseTheme = createTheme({
    typography: {
        fontFamily:  "'Inter', sans-serif",
        h4: { fontWeight: 700, color: '#2b1812' },
        body1: { color: '#663c2c' },
    },
    palette: {
        mode: 'light',
        primary: {
            main: '#d85a38',   // sunrise orange
            dark: '#a83c21',   // deep rust
            light: '#ffd6c4',
        },
        secondary: { main: '#663c2c' },
        background: {
            default: 'transparent',
            paper: '#fffaf5',
        },
        text: {
            primary: '#2b1812',
            secondary: '#00000099',
        },
        divider: 'rgba(216,90,56,0.18)',
        action: {
            hover: 'rgba(216,90,56,0.08)',
            selected: 'rgba(216,90,56,0.14)',
            active: '#2b1812',
            disabled: 'rgba(43,24,18,0.3)',
            disabledBackground: 'rgba(43,24,18,0.08)',
        },
        success: { main: '#4d7c0f', light: '#f7fee7', dark: '#3a5c0b' },
        error:   { main: '#dc2626', light: '#fef2f2', dark: '#991b1b' },
    },
    sidebar: {
        background: 'linear-gradient(to bottom, rgba(74, 28, 21, 0.85), rgba(168, 60, 33, 0.4)), url("/images/rising-sun.avif") center bottom / cover no-repeat',
        hover: 'rgba(255,190,150,0.12)',
        selected: '#ffdcb5',
        selectedItemBg: 'rgba(255,220,181,0.20)',
        unselected: 'rgba(255,220,181,0.7)',
        cardHoverGradient: 'linear-gradient(90deg, #a83c21 0%, #d85a38 50%, #facc6b 100%)',
        itemFontSize: '0.82rem',
        itemFontWeight: 400,
        itemFontWeightSelected: 600,
    },
    shimmer: {
        base: 'rgba(216,90,56,0.07)',
        highlight: 'rgba(216,90,56,0.15)',
    },
    card: {
        actionOverlay: '#fffaf5',
    },
    login: {
        pageBackground: 'linear-gradient(135deg, #3b0e07 0%, #7a2412 50%, #a83c21 100%)',
        leftPanelBackground: 'linear-gradient(135deg, #1e0804 0%, #4a1409 50%, #7a2412 100%)',
        rightPanelBackground: '#fffaf5',
        rightPanelText: '#2b1812',
        buttonBackground: '#d85a38',
        buttonHover: '#a83c21',
        buttonDisabled: '#d85a3880',
    },
    components: {
        ...sharedComponents,
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: '#fffaf5',
                    boxShadow: '0 4px 24px rgba(216,90,56,0.10)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(255,250,245,0.88)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                },
            },
        },
    },
});

// ── Forest ────────────────────────────────────────────────────────────────────
// Text: #1a2e1e (dark forest) · Background: #f1f6f1 (pale sage)
export const forestTheme = createTheme({
    typography: {
        fontFamily:  "'Inter', sans-serif",
        h4: { fontWeight: 700, color: '#1a2e1e' },
        body1: { color: '#3b5c43' },
    },
    palette: {
        mode: 'light',
        primary: {
            main: '#2e7d32',   // forest green
            dark: '#1b5e20',   // deep pine
            light: '#a5d6a7',
        },
        secondary: { main: '#3b5c43' },
        background: {
            default: 'transparent',
            paper: '#f8fdf8',
        },
        text: {
            primary: '#1a2e1e',
            secondary: '#00000099',
        },
        divider: 'rgba(46,125,50,0.18)',
        action: {
            hover: 'rgba(46,125,50,0.08)',
            selected: 'rgba(46,125,50,0.14)',
            active: '#1a2e1e',
            disabled: 'rgba(26,46,30,0.3)',
            disabledBackground: 'rgba(26,46,30,0.08)',
        },
        success: { main: '#2e7d32', light: '#f0fdf4', dark: '#1b5e20' },
        error:   { main: '#dc2626', light: '#fef2f2', dark: '#991b1b' },
    },
    sidebar: {
        background: 'linear-gradient(to bottom, rgba(16, 42, 24, 0.85), rgba(46, 125, 50, 0.4)), url("/images/forest-theme.avif") center bottom / cover no-repeat',
        hover: 'rgba(165,214,167,0.15)',
        selected: '#e8f5e9',
        selectedItemBg: 'rgba(165,214,167,0.25)',
        unselected: 'rgba(200,230,201,0.75)',
        cardHoverGradient: 'linear-gradient(90deg, #1b5e20 0%, #2e7d32 50%, #81c784 100%)',
        itemFontSize: '0.82rem',
        itemFontWeight: 400,
        itemFontWeightSelected: 600,
    },
    shimmer: {
        base: 'rgba(46,125,50,0.07)',
        highlight: 'rgba(46,125,50,0.15)',
    },
    card: {
        actionOverlay: '#f8fdf8',
    },
    login: {
        pageBackground: 'linear-gradient(135deg, #071a09 0%, #0f3d14 50%, #1b5e20 100%)',
        leftPanelBackground: 'linear-gradient(135deg, #040f06 0%, #0a2a0d 50%, #0f3d14 100%)',
        rightPanelBackground: '#f8fdf8',
        rightPanelText: '#1a2e1e',
        buttonBackground: '#2e7d32',
        buttonHover: '#1b5e20',
        buttonDisabled: '#2e7d3280',
    },
    components: {
        ...sharedComponents,
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: '#f8fdf8',
                    boxShadow: '0 4px 24px rgba(46,125,50,0.10)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(241,246,241,0.88)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                },
            },
        },
    },
});

// ── Water ─────────────────────────────────────────────────────────────────────
// Text: #00363a (deep cyan) · Background: #f1fbfd (pale water)
export const waterTheme = createTheme({
    typography: {
        fontFamily:  "'Inter', sans-serif",
        h4: { fontWeight: 700, color: '#00363a' },
        body1: { color: '#005b61' },
    },
    palette: {
        mode: 'light',
        primary: {
            main: '#00838f',   // vibrant cyan
            dark: '#005662',   // deep water
            light: '#80deea',
        },
        secondary: { main: '#005b61' },
        background: {
            default: 'transparent',
            paper: '#f8fbfc',
        },
        text: {
            primary: '#00363a',
            secondary: '#00000099',
        },
        divider: 'rgba(0,131,143,0.18)',
        action: {
            hover: 'rgba(0,131,143,0.08)',
            selected: 'rgba(0,131,143,0.14)',
            active: '#00363a',
            disabled: 'rgba(0,54,58,0.3)',
            disabledBackground: 'rgba(0,54,58,0.08)',
        },
        success: { main: '#0e7490', light: '#ecfeff', dark: '#155e75' },
        error:   { main: '#dc2626', light: '#fef2f2', dark: '#991b1b' },
    },
    sidebar: {
        background: 'linear-gradient(to bottom, rgba(0, 54, 58, 0.85), rgba(0, 131, 143, 0.4)), url("/images/water.avif") center bottom / cover no-repeat',
        hover: 'rgba(128,222,234,0.15)',
        selected: '#e0f7fa',
        selectedItemBg: 'rgba(128,222,234,0.25)',
        unselected: 'rgba(178,235,242,0.75)',
        cardHoverGradient: 'linear-gradient(90deg, #005662 0%, #00838f 50%, #4dd0e1 100%)',
        itemFontSize: '0.82rem',
        itemFontWeight: 400,
        itemFontWeightSelected: 600,
    },
    shimmer: {
        base: 'rgba(0,131,143,0.07)',
        highlight: 'rgba(0,131,143,0.15)',
    },
    card: {
        actionOverlay: '#f8fbfc',
    },
    login: {
        pageBackground: 'linear-gradient(135deg, #005662 0%, #00838f 50%, #4dd0e1 100%)',
        leftPanelBackground: 'linear-gradient(135deg, #00363a 0%, #005662 50%, #00838f 100%)',
        rightPanelBackground: '#f8fbfc',
        rightPanelText: '#00363a',
        buttonBackground: '#00838f',
        buttonHover: '#005662',
        buttonDisabled: '#00838f80',
    },
    components: {
        ...sharedComponents,
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: '#f8fbfc',
                    boxShadow: '0 4px 24px rgba(0,131,143,0.10)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(235,248,251,0.88)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                },
            },
        },
    },
});

// ── Lookup map ────────────────────────────────────────────────────────────────
export const themeMap: Record<ThemeName, Theme> = {
    light: lightTheme,
    dark: darkTheme,
    coffee: coffeeTheme,
    ocean: oceanTheme,
    sunrise: sunriseTheme,
    forest: forestTheme,
    water: waterTheme,
};

// Default export for any legacy imports
export default lightTheme;
