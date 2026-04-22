'use client';

import { useState } from 'react';
import { Box, Typography, Menu, MenuItem, ButtonBase, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CheckIcon from '@mui/icons-material/Check';
import { useThemeName, ThemeName } from '@/context/ThemeContext';

const themes: { name: ThemeName; label: string; subtitle: string; gradient: string }[] = [
    {
        name: 'light',
        label: 'Jade',
        subtitle: 'Clean & minimal',
        gradient: 'linear-gradient(135deg, #0d5f57 0%, #0f766e 50%, #c2ffbf 100%)',
    },
    {
        name: 'dark',
        label: 'Midnight',
        subtitle: 'Dark & focused',
        gradient: 'linear-gradient(135deg, #0f172a 0%, #1e0a3c 50%, #9585c0 100%)',
    },
    {
        name: 'coffee',
        label: 'Mocha',
        subtitle: 'Warm & cozy',
        gradient: 'linear-gradient(135deg, #3b2314 0%, #6f4e37 55%, #d4a974 100%)',
    },
    {
        name: 'ocean',
        label: 'Azure',
        subtitle: 'Crisp & oceanic',
        gradient: 'linear-gradient(135deg, #0D2035 0%, #1A6FA8 55%, #ACC8E5 100%)',
    },
    {
        name: 'sunrise',
        label: 'Ember',
        subtitle: 'Bold & vibrant',
        gradient: 'linear-gradient(135deg, #7a2412 0%, #d85a38 55%, #facc6b 100%)',
    },
    {
        name: 'forest',
        label: 'Evergreen',
        subtitle: 'Natural & calm',
        gradient: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 55%, #81c784 100%)',
    },
    {
        name: 'water',
        label: 'Cascade',
        subtitle: 'Fresh & flowing',
        gradient: 'linear-gradient(135deg, #005662 0%, #00838f 55%, #4dd0e1 100%)',
    },
];

function Swatch({ gradient, size = 18 }: { gradient: string; size?: number }) {
    return (
        <Box sx={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: gradient,
            flexShrink: 0,
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }} />
    );
}

export default function ThemeToggle() {
    const { themeName, setThemeName } = useThemeName();
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);
    const theme = useTheme();

    const current = themes.find((t) => t.name === themeName) ?? themes[0];
    const borderColor = alpha(theme.palette.text.secondary, 0.30);
    const bgColor = alpha(theme.palette.text.secondary, 0.07);
    const bgHoverColor = alpha(theme.palette.text.secondary, 0.13);

    return (
        <>
            <ButtonBase
                onClick={(e) => setAnchor(e.currentTarget)}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.1,
                    py: 0.5,
                    borderRadius: '8px',
                    border: `1px solid ${borderColor}`,
                    bgcolor: bgColor,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: bgHoverColor },
                    transition: 'background 0.18s',
                }}
            >
                <Swatch gradient={current.gradient} />
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1 }}>
                    {current.label}
                </Typography>
                <KeyboardArrowDownIcon sx={{ fontSize: 14, color: 'text.disabled', ml: 0.1 }} />
            </ButtonBase>

            <Menu
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{
                    paper: {
                        sx: {
                            mt: 0.75,
                            minWidth: 190,
                            borderRadius: 2.5,
                            py: 0.75,
                            maxHeight: '250px',
                    overflowY: 'auto',
                        },
                    },
                }}
            >
                {themes.map((t) => {
                    const isActive = themeName === t.name;
                    return (
                        <MenuItem
                            key={t.name}
                            selected={isActive}
                            onClick={() => { setThemeName(t.name); setAnchor(null); }}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.25,
                                px: 1.5,
                                py: 0.8,
                                borderRadius: 1.5,
                                mx: 0.5,
                                minHeight: 0,
                            }}
                        >
                            <Swatch gradient={t.gradient} size={22} />

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{
                                    fontSize: '0.82rem',
                                    fontWeight: isActive ? 700 : 500,
                                    color: 'text.primary',
                                    lineHeight: 1.2,
                                }}>
                                    {t.label}
                                </Typography>
                                <Typography sx={{
                                    fontSize: '0.68rem',
                                    color: 'text.disabled',
                                    lineHeight: 1.3,
                                }}>
                                    {t.subtitle}
                                </Typography>
                            </Box>

                            {isActive && (
                                <CheckIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />
                            )}
                        </MenuItem>
                    );
                })}
            </Menu>
        </>
    );
}