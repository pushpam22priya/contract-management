# Localization (i18n) — Hindi & English
### Implementation Guide for Next.js 16 + React 19 (App Router)

> **Status: Fully Implemented.**
> This document reflects the actual implementation. Where the original plan differed from what was built, the reason is noted.

---

## Key Terms You Should Know

| Term | What it means |
|------|---------------|
| **i18n** | Short for "internationalization" — the process of making an app support multiple languages |
| **l10n** | Short for "localization" — translating and adapting the app for a specific language/region |
| **locale** | A string like `'en'` or `'hi'` that identifies the current language |
| **next-intl** | The i18n library used — it integrates with Next.js App Router and supports both server and client components |
| **`localePrefix`** | Controls whether the locale appears in the URL (`/en/dashboard`) or not. We use `'never'` — URLs stay clean |
| **`NEXT_LOCALE` cookie** | The browser cookie where the user's chosen language is stored. `next-intl` reads this automatically |
| **`router.refresh()`** | A Next.js method that re-fetches server component data without doing a full browser reload. Used after setting the cookie to apply the new language |
| **Server Component** | A React component that runs only on the server (no `useState`, no `useEffect`). `layout.tsx` is one |
| **Client Component** | A component with `'use client'` at the top — runs in the browser. Can use hooks |
| **`useTranslations`** | A next-intl hook used inside client components to get translated strings |
| **`getMessages`** | A next-intl server function used in `layout.tsx` to load the translation JSON for the current locale |
| **`getLocale`** | A next-intl server function that reads the current locale (from cookie) on the server side |
| **`NextIntlClientProvider`** | A React context provider that makes translations available to all client components below it in the tree |

---

## 1. Library

```bash
npm install next-intl
```

**Why:** `next-intl` is purpose-built for Next.js App Router. It handles server components, client components, and cookie-based locale detection with minimal setup. No runtime overhead — translations are loaded once per request.

---

## 2. Actual File Structure (What Was Built)

```
contract-management/
├── translations/
│   ├── en.json              ← All English strings
│   └── hi.json              ← All Hindi strings (readable Devanagari text)
├── src/
│   ├── i18n/
│   │   ├── routing.ts       ← Defines supported locales + localePrefix strategy
│   │   └── request.ts       ← Server-side: reads NEXT_LOCALE cookie, loads correct JSON
│   ├── app/
│   │   └── layout.tsx       ← Root layout (async) — wraps app with NextIntlClientProvider
│   └── components/
│       └── layout/
│           ├── Header.tsx   ← Language toggle added here, avatar removed
│           └── LanguageToggle.tsx  ← Pill toggle component (EN / हिं)
```

> **What changed vs the original plan:**
> - Folder is `translations/` not `messages/` (renamed by preference)
> - There is NO `src/app/[locale]/` folder — pages stay exactly where they are (see Step 6 below)
> - There is NO `src/middleware.ts` — removed because Next.js 16.1.1 deprecated it (see Step 4 below)

---

## 3. Step-by-Step Implementation

### Step 1 — Translation files

**Why this step:** All user-visible text is extracted from components into two JSON files — one per language. Components reference keys (`t('title')`) instead of hardcoded strings. This means the same component renders English or Hindi just by reading a different JSON.

**`translations/en.json`** (abbreviated)
```json
{
  "nav": {
    "dashboard": "Dashboard",
    "contracts": "Contracts",
    "draft": "Draft",
    "signatures": "Contract for Signature",
    "reviewApproval": "Review & Approval",
    "template": "Template",
    "terminated": "Terminated",
    "allContracts": "All Contracts"
  },
  "dashboard": {
    "title": "Dashboard",
    "browseTemplates": "Browse Templates",
    "createContract": "Create Contract",
    "hi": "Hi",
    "draft": "Draft",
    "inProgress": "In Progress",
    "sendForSignature": "Send for Signature",
    "waitingForMySignature": "Waiting for My Signature",
    "signedContracts": "Signed Contracts",
    "activeContracts": "Active Contracts",
    "expiringSoon": "Expiring Soon",
    "expired": "Expired"
  },
  "header": {
    "notifications": "Notifications",
    "logout": "Logout",
    "language": "Language",
    "switchToHindi": "Switch to Hindi",
    "switchToEnglish": "Switch to English"
  },
  "common": {
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "clearFilters": "Clear Filters"
  }
}
```

**`translations/hi.json`** — written in plain Devanagari (readable, easy to edit):
```json
{
  "nav": {
    "dashboard": "डैशबोर्ड",
    "contracts": "अनुबंध",
    "draft": "मसौदा",
    "signatures": "हस्ताक्षर हेतु अनुबंध",
    "reviewApproval": "समीक्षा और अनुमोदन",
    "template": "टेम्पलेट",
    "terminated": "समाप्त",
    "allContracts": "सभी अनुबंध"
  },
  "header": {
    "switchToHindi": "हिंदी में बदलें",
    "switchToEnglish": "अंग्रेज़ी में बदलें"
  }
}
```

> **Important:** Both files must always have the exact same keys. If a key exists in `en.json` but not `hi.json`, the app will throw an error in production.

---

### Step 2 — Locale routing config

**`src/i18n/routing.ts`**

```ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'hi'],
  defaultLocale: 'en',
  localePrefix: 'never',   // ← KEY DECISION (see note below)
});
```

**Why `localePrefix: 'never'`:**
The default strategy (`'as-needed'`) puts the locale in the URL — e.g. `/en/dashboard`, `/hi/dashboard`. This would have required moving every single page file into a `src/app/[locale]/` subfolder (a large restructuring).

We chose `'never'` instead. This keeps all URLs clean (`/dashboard` always) and stores the locale in the `NEXT_LOCALE` cookie. The trade-off: you cannot share a language-specific URL with someone, but for a contract management app used by a single user, this is perfectly fine.

---

### Step 3 — Server-side locale resolver

**`src/i18n/request.ts`**

```ts
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
```

**Why this step:** This function runs on the **server** on every page request. It reads the `NEXT_LOCALE` cookie, validates it (falls back to `'en'` if missing or invalid), then loads the matching JSON file. `next-intl` calls this automatically — you never call it manually.

> **What changed vs original plan:** The original plan used `requestLocale` (a parameter from next-intl). We switched to reading `cookies()` directly from `next/headers`. Reason: with `localePrefix: 'never'`, there is no locale in the URL, so `requestLocale` is always `undefined`. Reading the cookie directly is the correct approach for this strategy.

---

### Step 4 — Middleware (REMOVED for Next.js 16)

**Why it was removed:**

The original plan included creating `src/middleware.ts`. This was written and then **deleted** because Next.js 16.1.1 deprecated the `middleware` file convention in favour of `proxy`. Having a deprecated `middleware.ts` caused:
- A warning: *"The middleware file convention is deprecated. Please use proxy instead."*
- All routes returning **404** because the middleware was being ignored

Since we use `localePrefix: 'never'` (no URL rewriting needed), middleware is not required at all. The locale is determined purely by reading the cookie in `request.ts`.

> **Rule of thumb for Next.js 16:** Do not use `middleware.ts` for i18n. Cookie-based detection + `request.ts` is sufficient.

---

### Step 5 — next.config.ts

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default withNextIntl(nextConfig);
```

**Why:** `createNextIntlPlugin` tells Next.js where your locale resolver lives (`request.ts`). Without this, `getLocale()` and `getMessages()` in server components won't work. It wraps your existing config — you don't lose any existing settings.

> **Note:** This project uses `next.config.ts` (TypeScript), not `.js`. The import syntax uses `import` not `require`.

---

### Step 6 — Root layout (no [locale] folder needed)

**Why this step:** The root `layout.tsx` is a server component that wraps the entire app. We make it `async` so it can call `getLocale()` and `getMessages()`, then pass those to `NextIntlClientProvider`. This is the bridge between server-loaded translations and client components.

**`src/app/layout.tsx`**
```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

export default async function RootLayout({ children }) {
  const locale = await getLocale();      // reads NEXT_LOCALE cookie server-side
  const messages = await getMessages();  // loads the correct JSON

  return (
    <html lang={locale}>
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <NextIntlClientProvider locale={locale} messages={messages}>
              <AppInitializer>
                {children}
              </AppInitializer>
            </NextIntlClientProvider>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
```

> **What changed vs original plan:** The plan described a separate `src/app/[locale]/layout.tsx` and moving all pages into that subfolder. We did NOT do this. Because `localePrefix: 'never'` was chosen, no URL restructuring is needed. The existing root `layout.tsx` was simply updated to be `async` and wrap children with `NextIntlClientProvider`.

---

### Step 7 — LanguageToggle component

**`src/components/layout/LanguageToggle.tsx`**

```tsx
'use client';

import { Box, Tooltip } from '@mui/material';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export default function LanguageToggle() {
  const locale = useLocale();        // current locale from next-intl context
  const router = useRouter();
  const t = useTranslations('header');

  const switchTo = (next: 'en' | 'hi') => {
    if (next === locale) return;
    // Set the NEXT_LOCALE cookie — next-intl reads this on the next server request
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    // Re-fetch server components so the new locale is applied
    router.refresh();
  };

  return (
    <Tooltip title={locale === 'en' ? t('switchToHindi') : t('switchToEnglish')} arrow>
      <Box sx={{ position: 'relative', display: 'flex', ... }}>
        {/* Sliding teal pill (CSS left transition) */}
        <Box sx={{ position: 'absolute', left: locale === 'en' ? 2 : 'calc(50% + 1px)', transition: 'left 0.28s cubic-bezier(...)' }} />
        <Box onClick={() => switchTo('en')}>EN</Box>
        <Box onClick={() => switchTo('hi')}>हिं</Box>
      </Box>
    </Tooltip>
  );
}
```

**Why this design:**
- Setting `document.cookie` is instant and doesn't cause a page reload
- `router.refresh()` re-fetches server component data (including `getLocale()` and `getMessages()`) without a full browser reload — state like open dialogs or scroll position is preserved
- The pill has a **sliding teal indicator** (CSS `left` transition with `cubic-bezier`) rather than two separate buttons — this feels like a native toggle switch
- Tooltip text itself is translated (switches between "Switch to Hindi" / "अंग्रेज़ी में बदलें")

> **What changed vs original plan:** The original plan used `useRouter` from `next-intl` and path string replacement to navigate to `/hi/dashboard`. We use `document.cookie` + `router.refresh()` from Next.js instead. Reason: `localePrefix: 'never'` means there is no locale in the URL to replace.

---

### Step 8 — Using translations in components

**Client components** (any component with `'use client'`):
```tsx
import { useTranslations } from 'next-intl';

export default function Sidebar() {
  const t = useTranslations('nav');    // pass the section name from the JSON
  return <span>{t('dashboard')}</span>; // "Dashboard" or "डैशबोर्ड"
}
```

**Multiple sections in one component:**
```tsx
const tNav = useTranslations('nav');
const tCommon = useTranslations('common');
return <>{tNav('dashboard')} — {tCommon('cancel')}</>;
```

**Why:** `useTranslations` is a hook that reads from the context provided by `NextIntlClientProvider`. It takes a namespace (the top-level key in the JSON) and returns a `t()` function. The hook is reactive — when the locale changes, all components using it automatically show the new language.

---

## 4. How the Language Switch Works End-to-End

```
User clicks हिं in the toggle
        ↓
document.cookie = 'NEXT_LOCALE=hi; ...'   (browser stores preference)
        ↓
router.refresh()   (Next.js re-fetches server components)
        ↓
layout.tsx runs on server:
  getLocale()   → reads cookie → 'hi'
  getMessages() → loads translations/hi.json
        ↓
NextIntlClientProvider re-renders with new messages
        ↓
All useTranslations() hooks return Hindi strings
        ↓
Page shows Hindi — URL stays /dashboard (unchanged)
        ↓
User refreshes browser → cookie persists → still Hindi
```

---

## 5. Animation Fix — Stats Cards

**Problem:** When `router.refresh()` is called on language switch, the dashboard stats cards re-mounted and replayed their entry (Grow) animation and count-up effect, which felt jarring.

**Fix applied in `ColorfulStatsCard.tsx`:**

```tsx
// Module-level Set — survives remounts, lives for the full browser session
const animatedCardIndices = new Set<number>();

export default function ColorfulStatsCard({ index = 0, ... }) {
  const isFirstMount = !animatedCardIndices.has(index);  // false after first mount

  useEffect(() => {
    animatedCardIndices.add(index);  // mark as animated
  }, [index]);

  return (
    // timeout=0 means Grow is instant (no visible animation) on subsequent mounts
    <Grow in timeout={isFirstMount ? 250 + index * 60 : 0}>
      ...
    </Grow>
  );
}
```

**Why a module-level variable and not `useState` or `useRef`:** Both `useState` and `useRef` reset when a component unmounts and remounts. A module-level `Set` lives outside the React lifecycle — it persists for the entire browser session. On the first page load, the Set is empty and cards animate. On any subsequent remount (language switch, navigation back), the Set already has the indices and `timeout=0` skips the animation.

---

## 6. Pages & Components Translated

| File | Namespace used | What is translated |
|------|---------------|-------------------|
| `Sidebar.tsx` | `nav` | All navigation labels |
| `Header.tsx` | `header` | Notifications tooltip, Logout tooltip |
| `LanguageToggle.tsx` | `header` | Tooltip text |
| `dashboard/page.tsx` | `dashboard` | Hero label, buttons, greeting, all 8 card titles |
| `all-contracts/page.tsx` | `nav` | Tab labels |
| `draft/page.tsx` | `draft` | Page subtitle |
| `signatures/page.tsx` | `signatures` | Page title, subtitle |
| `review-approval/page.tsx` | `reviewApproval` | Page title, subtitle |
| `template/page.tsx` | `template` | Title, subtitle, upload tooltip, empty states, delete dialog |
| `terminated/page.tsx` | `terminated` | Title, subtitle, empty states |

---

## 7. What Stays Hardcoded (Not Translated)

- Contract titles, client names, dates — these are **user data**, not UI text
- API error messages shown only in the browser console
- Email addresses and URLs
- `ContractStatus` enum values — internal code, never shown raw to users
- Form field names inside PDFs — these come from the template itself

---

## 8. How to Add a New Translation

**Step 1 — Add the key to both JSON files:**

`translations/en.json`:
```json
"notifications": {
  "title": "Notifications",
  "markAllRead": "Mark all as read",
  "noNotifications": "No notifications yet"
}
```

`translations/hi.json`:
```json
"notifications": {
  "title": "सूचनाएं",
  "markAllRead": "सभी पढ़े हुए चिह्नित करें",
  "noNotifications": "अभी कोई सूचना नहीं"
}
```

**Step 2 — Use it in the component:**
```tsx
const t = useTranslations('notifications');
return <h1>{t('title')}</h1>;
```

**Rules:**
1. The key must exist in **both** JSON files
2. The namespace (first argument to `useTranslations`) must match the top-level key in the JSON
3. You can type Hindi directly in VS Code — Devanagari input is supported

---

## 9. Summary of All Files Created / Modified

| Action | File | What changed |
|--------|------|-------------|
| Created | `translations/en.json` | All English strings |
| Created | `translations/hi.json` | All Hindi strings (plain Devanagari) |
| Created | `src/i18n/routing.ts` | `localePrefix: 'never'`, supported locales |
| Created | `src/i18n/request.ts` | Reads `NEXT_LOCALE` cookie, loads JSON |
| **Deleted** | `src/middleware.ts` | Deprecated in Next.js 16.1.1 — caused 404s |
| Modified | `next.config.ts` | Wrapped with `createNextIntlPlugin` |
| Modified | `src/app/layout.tsx` | Made `async`, added `NextIntlClientProvider` |
| Created | `src/components/layout/LanguageToggle.tsx` | Sliding pill toggle component |
| Modified | `src/components/layout/Header.tsx` | Added `LanguageToggle`, removed Avatar, translated tooltips |
| Modified | `src/components/layout/Sidebar.tsx` | All nav labels use `useTranslations('nav')` |
| Modified | `src/app/dashboard/page.tsx` | Hero text, buttons, greeting, card titles |
| Modified | `src/app/all-contracts/page.tsx` | Tab labels |
| Modified | `src/app/draft/page.tsx` | Subtitle |
| Modified | `src/app/signatures/page.tsx` | Title, subtitle |
| Modified | `src/app/review-approval/page.tsx` | Title, subtitle |
| Modified | `src/app/template/page.tsx` | Title, subtitle, empty states, delete dialog |
| Modified | `src/app/terminated/page.tsx` | Title, subtitle, empty states |
| Modified | `src/components/dashboard/ColorfulStatsCard.tsx` | Animation fix — no re-animation on language switch |
