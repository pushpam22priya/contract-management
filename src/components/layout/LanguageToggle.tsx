'use client';

import { Box, Tooltip } from '@mui/material';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export default function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('header');

  const switchTo = (next: 'en' | 'hi') => {
    if (next === locale) return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  };

  const tooltipTitle = locale === 'en' ? t('switchToHindi') : t('switchToEnglish');

  return (
    <Tooltip title={tooltipTitle} arrow placement="bottom">
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'rgba(15,118,110,0.07)',
          border: '1px solid rgba(15,118,110,0.22)',
          borderRadius: '20px',
          height: 26,
          p: '2px',
          userSelect: 'none',
          flexShrink: 0,
          cursor: 'pointer',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'rgba(15,118,110,0.11)',
          },
          transition: 'border-color 0.2s, background-color 0.2s',
        }}
      >
        {/* Sliding teal pill */}
        <Box
          sx={{
            position: 'absolute',
            top: 2,
            left: locale === 'en' ? 2 : 'calc(50% + 1px)',
            width: 'calc(50% - 3px)',
            height: 'calc(100% - 4px)',
            bgcolor: 'primary.main',
            borderRadius: '14px',
            transition: 'left 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 2px 8px rgba(15,118,110,0.4)',
            zIndex: 0,
          }}
        />

        {/* EN label */}
        <Box
          onClick={() => switchTo('en')}
          sx={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            minWidth: 30,
            px: 1.1,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: locale === 'en' ? 'white' : 'primary.main',
            transition: 'color 0.28s',
          }}
        >
          EN
        </Box>

        {/* हिं label */}
        <Box
          onClick={() => switchTo('hi')}
          sx={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            minWidth: 30,
            px: 1.1,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: locale === 'hi' ? 'white' : 'primary.main',
            transition: 'color 0.28s',
            fontFamily: '"Noto Sans Devanagari", "Arial Unicode MS", sans-serif',
          }}
        >
          हिं
        </Box>
      </Box>
    </Tooltip>
  );
}
