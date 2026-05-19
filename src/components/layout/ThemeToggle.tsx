'use client';

import { useState } from 'react';
import { Box, Typography, Menu, MenuItem, ButtonBase, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CheckIcon from '@mui/icons-material/Check';
import { useThemeName, ThemeName } from '@/context/ThemeContext';
import { useTranslations } from 'next-intl';

const themes: { name: ThemeName; labelKey: string; subtitleKey: string; gradient: string }[] = [
    {
        name: 'light',
        labelKey: 'jadeLabel',
        subtitleKey: 'jadeSubtitle',
        gradient: 'linear-gradient(135deg, #0d5f57 0%, #0f766e 50%, #c2ffbf 100%)',
    },
    {
        name: 'dark',
        labelKey: 'midnightLabel',
        subtitleKey: 'midnightSubtitle',
        gradient: 'linear-gradient(135deg, #0f172a 0%, #1e0a3c 50%, #9585c0 100%)',
    },
    {
        name: 'coffee',
        labelKey: 'mochaLabel',
        subtitleKey: 'mochaSubtitle',
        gradient: 'linear-gradient(135deg, #3b2314 0%, #6f4e37 55%, #d4a974 100%)',
    },
    {
        name: 'ocean',
        labelKey: 'azureLabel',
        subtitleKey: 'azureSubtitle',
        gradient: 'linear-gradient(135deg, #0D2035 0%, #1A6FA8 55%, #ACC8E5 100%)',
    },
    {
        name: 'sunrise',
        labelKey: 'emberLabel',
        subtitleKey: 'emberSubtitle',
        gradient: 'linear-gradient(135deg, #7a2412 0%, #d85a38 55%, #facc6b 100%)',
    },
    {
        name: 'forest',
        labelKey: 'evergreenLabel',
        subtitleKey: 'evergreenSubtitle',
        gradient: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 55%, #81c784 100%)',
    },
    {
        name: 'water',
        labelKey: 'cascadeLabel',
        subtitleKey: 'cascadeSubtitle',
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
    const t = useTranslations('themes');

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
                    {t(current.labelKey as any)}
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
                {themes.map((tItem) => {
                    const isActive = themeName === tItem.name;
                    return (
                        <MenuItem
                            key={tItem.name}
                            selected={isActive}
                            onClick={() => { setThemeName(tItem.name); setAnchor(null); }}
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
                            <Swatch gradient={tItem.gradient} size={22} />

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{
                                    fontSize: '0.82rem',
                                    fontWeight: isActive ? 700 : 500,
                                    color: 'text.primary',
                                    lineHeight: 1.2,
                                }}>
                                    {t(tItem.labelKey as any)}
                                </Typography>
                                <Typography sx={{
                                    fontSize: '0.68rem',
                                    color: 'text.disabled',
                                    lineHeight: 1.3,
                                }}>
                                    {t(tItem.subtitleKey as any)}
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