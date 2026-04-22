'use client';

import { useState } from 'react';
import { Box, Typography, Menu, MenuItem, ButtonBase, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useThemeName, ThemeName } from '@/context/ThemeContext';

const themes: { name: ThemeName; label: string; gradient: string }[] = [
    { name: 'light',  label: 'Light',  gradient: 'linear-gradient(135deg, #0d5f57 0%, #0f766e 50%, #c2ffbf 100%)' },
    { name: 'dark',   label: 'Dark',   gradient: 'linear-gradient(135deg, #0f172a 0%, #1e0a3c 50%, #9585c0 100%)' },
    { name: 'coffee', label: 'Coffee', gradient: 'linear-gradient(135deg, #3b2314 0%, #6f4e37 55%, #d4a974 100%)' },
    { name: 'ocean',  label: 'Ocean',  gradient: 'linear-gradient(135deg, #0D2035 0%, #1A6FA8 55%, #ACC8E5 100%)' },
    { name: 'sunrise',label: 'Sunrise',gradient: 'linear-gradient(135deg, #a83c21 0%, #d85a38 55%, #facc6b 100%)' },
    { name: 'forest', label: 'Forest', gradient: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 55%, #81c784 100%)' },
    { name: 'water',  label: 'Water',  gradient: 'linear-gradient(135deg, #005662 0%, #00838f 55%, #4dd0e1 100%)' },
];

function Swatch({ gradient, size = 18 }: { gradient: string; size?: number }) {
    return (
        <Box sx={{
            width: size,
            height: size,
            borderRadius: '4px',
            background: gradient,
            flexShrink: 0,
        }} />
    );
}

export default function ThemeToggle() {
    const { themeName, setThemeName } = useThemeName();
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);
    const theme = useTheme();

    const current = themes.find((t) => t.name === themeName) ?? themes[0];
    const borderColor = alpha(theme.palette.text.secondary, 0.35);
    const bgColor = alpha(theme.palette.text.secondary, 0.07);
    const bgHoverColor = alpha(theme.palette.text.secondary, 0.13);

    return (
        <>
            <ButtonBase
                onClick={(e) => setAnchor(e.currentTarget)}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.6,
                    px: 1,
                    py: 0.4,
                    borderRadius: '8px',
                    border: `1px solid ${borderColor}`,
                    bgcolor: bgColor,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: bgHoverColor },
                    transition: 'background 0.18s',
                }}
            >
                <Swatch gradient={current.gradient} />
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: 'text.secondary', lineHeight: 1 }}>
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
                            mt: 0.5,
                            minWidth: 130,
                            borderRadius: 2,
                            py: 0.5,
                        },
                    },
                }}
            >
                {themes.map((t) => (
                    <MenuItem
                        key={t.name}
                        selected={themeName === t.name}
                        onClick={() => { setThemeName(t.name); setAnchor(null); }}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.25,
                            px: 1.5,
                            py: 0.75,
                            fontSize: '0.8rem',
                            borderRadius: 1.5,
                            mx: 0.5,
                            fontWeight: themeName === t.name ? 700 : 400,
                        }}
                    >
                        <Swatch gradient={t.gradient} size={20} />
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: themeName === t.name ? 700 : 400, color: 'text.primary' }}>
                            {t.label}
                        </Typography>
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}
