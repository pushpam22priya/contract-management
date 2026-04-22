import type { Metadata } from "next";
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeRegistry } from '@/context/ThemeContext';
import type { ThemeName } from '@/theme/theme';
import { cookies } from 'next/headers';
import "./globals.css";
import AppInitializer from "@/components/common/AppInitializer";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

export const metadata: Metadata = {
  title: "Contract Management",
  description: "Contract Management System",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  // Read saved theme from cookie to prevent flash on first paint
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get('NEXT_THEME')?.value as ThemeName | undefined;
  const validThemes: ThemeName[] = ['light', 'dark', 'coffee', 'ocean', 'sunrise', 'forest', 'water'];
  const defaultTheme: ThemeName = savedTheme && validThemes.includes(savedTheme) ? savedTheme : 'light';

  return (
    <html lang={locale}>
      <body>
        <AppRouterCacheProvider>
          <ThemeRegistry defaultTheme={defaultTheme}>
            <NextIntlClientProvider locale={locale} messages={messages}>
              <AppInitializer>
                {children}
              </AppInitializer>
            </NextIntlClientProvider>
          </ThemeRegistry>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
