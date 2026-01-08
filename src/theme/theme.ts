'use client';
import { createTheme } from '@mui/material/styles';
import { Roboto } from 'next/font/google';

const roboto = Roboto({
    weight: ['300', '400', '500', '700'],
    subsets: ['latin'],
    display: 'swap',
});

declare module '@mui/material/styles' {
    interface Theme {
        sidebar: {
            selected: string;
            hover: string;
            unselected: string;
            background: string;
        };
    }
    interface ThemeOptions {
        sidebar?: {
            selected?: string;
            hover?: string;
            unselected?: string;
            background?: string;
        };
    }
}

const theme = createTheme({
    typography: {
        fontFamily: roboto.style.fontFamily,
        h4: {
            fontWeight: 700,
            color: '#1e293b',
        },
        body1: {
            color: '#475569',
        },
    },
    palette: {
        mode: 'light',
        primary: {
            main: '#0f766e',
            dark: '#0d5f57',
            light: '#2dd4bf',
        },
        secondary: {
            main: '#64748b',
        },
        background: {
            default: '#f1f5f9',
            paper: '#ffffff',
        },
    },
    sidebar: {
        selected: '#fff',
        hover: '#d1fae5',
        unselected: '#fff',
        background: '#0f766e',
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
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
    },
});

export default theme;