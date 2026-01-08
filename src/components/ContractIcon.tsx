'use client';

import { SvgIcon, SvgIconProps } from '@mui/material';

export default function ContractIcon(props: SvgIconProps) {
    return (
        <SvgIcon {...props} viewBox="0 0 100 100">
            <defs>
                <linearGradient id="paperGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#f1f5f9" />
                </linearGradient>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="2" dy="2" stdDeviation="2" floodOpacity="0.1" />
                </filter>
            </defs>

            {/* Document Sheet */}
            <rect
                x="22"
                y="12"
                width="56"
                height="76"
                rx="4"
                fill="url(#paperGradient)"
                filter="url(#shadow)"
            />

            {/* Header Block (Teal brand accent) */}
            <rect x="22" y="12" width="56" height="12" rx="4" fill="#0f766e" opacity="0.1" />

            {/* Text Lines */}
            <rect x="30" y="32" width="40" height="3" rx="1.5" fill="#cbd5e1" />
            <rect x="30" y="40" width="40" height="3" rx="1.5" fill="#cbd5e1" />
            <rect x="30" y="48" width="25" height="3" rx="1.5" fill="#cbd5e1" />

            {/* Signature (The "Specific" Element) */}
            <path
                d="M32 72C35 72 35 68 38 68C40 68 40 74 43 74C46 74 48 70 52 70"
                fill="none"
                stroke="#0f766e"
                strokeWidth="2"
                strokeLinecap="round"
            />

            {/* Fountain Pen (Detailed Logo Style) */}
            <g transform="translate(50, 50)">
                {/* Pen Body */}
                <path
                    d="M0 0 L15 -15 L35 5 L20 20 Z"
                    fill="#0f766e" // Deep Teal
                />
                {/* Pen Nib Holder (Gold/Accent) */}
                <path
                    d="M0 0 L5 5 L-5 15 L-10 10 Z"
                    fill="#f59e0b" // Amber/Gold for contrast
                />
                {/* Pen Tip (Nib) */}
                <path
                    d="M-5 15 L-10 10 L-18 22 Z"
                    fill="#334155" // Dark nib
                />
            </g>
        </SvgIcon>
    );
}
