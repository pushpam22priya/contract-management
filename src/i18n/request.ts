import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { routing } from './routing';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const locale =
    cookieLocale && routing.locales.includes(cookieLocale as 'en' | 'hi')
      ? cookieLocale
      : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../translations/${locale}.json`)).default,
  };
});
