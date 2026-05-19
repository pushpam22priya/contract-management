# Form Validation Architecture

**Version:** 1.0  
**Date:** 2026-05-12  
**Status:** Implemented  
**Scope:** All user-facing forms across the Contract Management System

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Principles](#3-architecture-principles)
4. [Schema Layer](#4-schema-layer)
   - 4.1 [profileSchema.ts](#41-profileschemats)
   - 4.2 [loginSchema.ts](#42-loginschemats)
   - 4.3 [templateSchema.ts](#43-templateschemats)
   - 4.4 [contractSchema.ts](#44-contractschemats)
5. [Component Integration Pattern](#5-component-integration-pattern)
   - 5.1 [useForm Setup](#51-useform-setup)
   - 5.2 [watch()](#52-watch)
   - 5.3 [Controller](#53-controller)
   - 5.4 [trigger()](#54-trigger)
   - 5.5 [reset()](#55-reset)
6. [Coverage Map](#6-coverage-map)
7. [Field-Type Decision Matrix](#7-field-type-decision-matrix)
8. [i18n Integration](#8-i18n-integration)
9. [Validation Boundaries](#9-validation-boundaries)
10. [Error Display Conventions](#10-error-display-conventions)

---

## 1. Overview

The Contract Management System uses a two-library validation stack — **Zod** for schema definition and **React Hook Form (RHF)** for form state management — applied uniformly across all standard text-input forms.

Prior to this architecture, each form maintained independent `useState` variables for field values, separate `useState` variables for error messages, and custom `if (!field.trim())` validation blocks inside submit handlers. This led to duplicated logic, inconsistent error timing, and no type-safety guarantees between the schema and the form values.

The current architecture centralises validation rules into dedicated schema files, derives TypeScript types directly from those schemas, and delegates form state to RHF — eliminating the manual validation blocks entirely.

---

## 2. Technology Stack

| Library | Version | Role |
|---|---|---|
| `zod` | ^3.x | Schema definition, type inference, validation rules |
| `react-hook-form` | ^7.x | Form state, field registration, validation orchestration |
| `@hookform/resolvers` | ^3.x | Bridge that connects a Zod schema to RHF's resolver API |
| `next-intl` | ^3.x | Provides the `t()` translator used by i18n-aware schemas |

---

## 3. Architecture Principles

**1. Schema-first.** Every validated form begins with a Zod schema. The TypeScript type for the form is always derived from the schema using `z.infer`, never written by hand. This means the type and the validation rule are always in sync.

**2. Separation of concerns.** Schemas live in `src/schemas/`, separate from the components that use them. A schema is a pure data contract with no knowledge of React, MUI, or any UI library.

**3. Inline schemas for single-field forms.** When a form has only one field (e.g., `CreateTeamDialog`, `RenameTeamDialog`), the schema is defined inline in the component file. The overhead of a separate file is not justified for a single constraint.

**4. Factory functions for i18n.** Schemas whose error messages must appear in the user's locale are defined as factory functions — `makeProfileSchema(t)`, `makeLoginSchema(t)` — that accept the `t()` translator and return a Zod schema. This is memoized inside the component with `useMemo(() => makeSchema(t), [t])` so the schema only rebuilds when the locale changes.

**5. Validate on demand.** Validation is not run on every keystroke. It is triggered explicitly via `trigger()` when the user attempts to advance a step or submit a form. After the first trigger, RHF re-validates on each change automatically, providing real-time feedback without being intrusive on first entry.

**6. Non-standard inputs keep their own state.** MUI `DatePicker`, `Autocomplete`, and custom file-drop areas are not wrapped in `Controller`. These inputs have structural or data-type requirements (e.g., Dayjs objects, File objects) that do not map cleanly to Zod's string/number primitives. They retain `useState` and their own validation logic. Only standard `TextField` inputs are managed by RHF.

---

## 4. Schema Layer

All schema files are located at `src/schemas/`.

### 4.1 `profileSchema.ts`

**Path:** `src/schemas/profileSchema.ts`  
**Used by:** `src/components/layout/ProfileSettingsDialog.tsx`  
**Pattern:** i18n factory function (`makeProfileSchema(t)`)

```
makeProfileSchema(t) → ZodObject
```

| Field | Type | Rules |
|---|---|---|
| `name` | string | Optional. If provided: min 2 chars, max 100 chars, letters/spaces/hyphens/dots/apostrophes only |
| `department` | string | Optional. Max 100 chars |
| `organization` | string | Optional. Max 150 chars |
| `dateOfBirth` | string | Optional. Must be a valid date, not in the future, not more than 120 years ago |
| `gender` | string | No constraints (select field) |
| `permanentAddress` | string | Optional. Max 500 chars |
| `panCard` | string | Optional. Must match `^[A-Z]{5}[0-9]{4}[A-Z]{1}$` if provided |
| `aadharCard` | string | Optional. Must be exactly 12 characters if provided |

All error messages are resolved through `t()` keys defined in `translations/en.json` and `translations/hi.json`. The optional fields use the pattern `refine(v => !v.trim() || <rule>)` so that an empty value always passes — the rule only fires if the user has entered something.

**TypeScript type:**
```typescript
export type ProfileForm = z.infer<ReturnType<typeof makeProfileSchema>>;
```

---

### 4.2 `loginSchema.ts`

**Path:** `src/schemas/loginSchema.ts`  
**Used by:** `src/app/login/page.tsx`  
**Pattern:** i18n factory function (`makeLoginSchema(t)`)

| Field | Type | Rules |
|---|---|---|
| `email` | string | Required. Must be a valid email address |
| `password` | string | Required. No complexity rules (existing behaviour preserved) |

**TypeScript type:**
```typescript
export type LoginForm = z.infer<ReturnType<typeof makeLoginSchema>>;
```

---

### 4.3 `templateSchema.ts`

**Path:** `src/schemas/templateSchema.ts`  
**Used by:** `src/components/template/UploadTemplateDialog.tsx`, `src/components/template/EditTemplateDialog.tsx`  
**Pattern:** Static schema (no i18n — all strings are hardcoded English)

| Field | Type | Rules |
|---|---|---|
| `templateName` | string | Required. Min 1, max 50 chars |
| `description` | string | Optional. Max 200 chars |
| `category` | string | Required. Min 1 (empty string fails) |

**TypeScript type:**
```typescript
export type TemplateStep1Form = z.infer<typeof templateStep1Schema>;
```

---

### 4.4 `contractSchema.ts`

**Path:** `src/schemas/contractSchema.ts`  
**Used by:** `src/components/contracts/CreateContractDialog.tsx`, `src/components/contracts/RenewContractDialog.tsx`  
**Pattern:** Static schemas (no i18n)

This file exports two independent schemas.

**`contractStep1Schema`** — used by `CreateContractDialog`

| Field | Type | Rules |
|---|---|---|
| `contractTitle` | string | Required. Min 1, max 50 chars |
| `clientName` | string | Required. Min 1, max 50 chars |
| `description` | string | Optional. Max 500 chars |

**`renewContractSchema`** — used by `RenewContractDialog`

| Field | Type | Rules |
|---|---|---|
| `notes` | string | Optional. Max 300 chars |

**TypeScript types:**
```typescript
export type ContractStep1Form = z.infer<typeof contractStep1Schema>;
export type RenewContractForm  = z.infer<typeof renewContractSchema>;
```

---

## 5. Component Integration Pattern

Every component that uses this architecture follows the same five-step pattern. The example below uses `CreateContractDialog` as the reference.

### 5.1 `useForm` Setup

```typescript
const { control, reset, watch, trigger } = useForm<ContractStep1Form>({
    resolver: zodResolver(contractStep1Schema),
    defaultValues: { contractTitle: '', clientName: '', description: '' },
});
```

- `resolver: zodResolver(...)` connects the Zod schema to RHF. Every time RHF runs validation, it passes the current field values through the Zod schema and maps any errors back to the corresponding fields.
- `defaultValues` defines the initial state of the form. These are also the values `reset()` returns the form to.
- The generic parameter `<ContractStep1Form>` gives TypeScript full type-checking over field names and value types throughout the component.

---

### 5.2 `watch()`

```typescript
const { contractTitle, clientName, description } = watch();
```

`watch()` subscribes to the current values of all form fields and returns them as a plain object. Destructuring with the original variable names means every existing reference in the component — button disabled states, `canSave` checks, data objects passed to APIs — continues to work without modification.

```typescript
// These lines require no changes after the migration:
const canSave = selectedTemplate && contractTitle.trim() && clientName.trim() && ...
const contractData = { name: contractTitle, client: clientName, description: description || '...' };
```

---

### 5.3 `Controller`

`Controller` is the RHF component that wires a third-party input (MUI `TextField`) into the form store. It replaces the manual `value` / `onChange` props.

**Before:**
```tsx
<TextField
    value={contractTitle}
    onChange={(e) => setContractTitle(e.target.value)}
    error={!!titleError}
    helperText={titleError}
/>
```

**After:**
```tsx
<Controller
    name="contractTitle"
    control={control}
    render={({ field, fieldState }) => (
        <TextField
            {...field}
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
        />
    )}
/>
```

- `{...field}` spreads `value`, `onChange`, `onBlur`, and `name` onto the TextField. The field behaves identically from the user's perspective.
- `fieldState.error` is populated by RHF after `trigger()` fires or after the field has been touched and a re-validation cycle completes.
- `fieldState.error?.message` is the string produced by the failing Zod rule (e.g., `"Contract title is required"`).

---

### 5.4 `trigger()`

`trigger()` runs the Zod schema validation for the specified fields immediately and returns a `Promise<boolean>`.

```typescript
const handleNextStep = async () => {
    if (!selectedTemplate) {
        setError('Please select a template');
        return;
    }
    const valid = await trigger(['contractTitle', 'clientName']);
    if (!valid) return;
    setCurrentStep(2);
};
```

- If validation passes, `valid` is `true` and execution continues.
- If validation fails, `valid` is `false`, the function returns early, and RHF marks the failed fields as touched. On the next render, `fieldState.error` is populated inside each affected `Controller`, and the error messages appear inline below the fields.
- No `setError(...)` call is needed for field-level errors. The `Controller` handles display automatically.

`trigger()` is called with an array of field names. This is important in multi-step forms: only the fields relevant to the current step are validated when the user clicks "Next". Fields on step 2 are not validated prematurely.

---

### 5.5 `reset()`

`reset()` clears all RHF-managed fields back to their `defaultValues` and clears all validation errors.

```typescript
const handleClose = () => {
    reset();              // clears contractTitle, clientName, description + any errors
    setContractValue(''); // clears non-RHF state manually
    setStartDate('');
    // ...
    onClose();
};
```

In dialogs that pre-fill data (e.g., `EditTemplateDialog`, `ProfileSettingsDialog`), `reset()` is called with a data object inside `useEffect`:

```typescript
useEffect(() => {
    if (open) {
        reset({
            templateName: template.name,
            description:  template.description || '',
            category:     template.category,
        });
    }
}, [open, template, reset]);
```

This replaces what was previously three or more individual `setState(value)` calls.

---

## 6. Coverage Map

The table below lists every form component and its validation status.

| Component | Schema File | RHF Fields | Non-RHF Fields | Pattern |
|---|---|---|---|---|
| `src/app/login/page.tsx` | `loginSchema.ts` | `email`, `password` | — | i18n factory |
| `src/components/layout/ProfileSettingsDialog.tsx` | `profileSchema.ts` | `name`, `department`, `organization`, `dateOfBirth`, `gender`, `permanentAddress`, `panCard`, `aadharCard` | — | i18n factory |
| `src/components/teams/CreateTeamDialog.tsx` | Inline | `name` | — | Static inline |
| `src/components/teams/RenameTeamDialog.tsx` | Inline | `name` | — | Static inline |
| `src/components/template/UploadTemplateDialog.tsx` | `templateSchema.ts` | `templateName`, `description`, `category` | `selectedFile` (File), date pickers | Static file |
| `src/components/template/EditTemplateDialog.tsx` | `templateSchema.ts` | `templateName`, `description`, `category` | `selectedFile` (File, optional) | Static file |
| `src/components/contracts/CreateContractDialog.tsx` | `contractSchema.ts` | `contractTitle`, `clientName`, `description` | `startDate`, `endDate` (Dayjs), `selectedTemplate` (Autocomplete) | Static file |
| `src/components/contracts/RenewContractDialog.tsx` | `contractSchema.ts` | `notes` | `startDate`, `endDate` (Dayjs), `selectedTemplate` (Autocomplete) | Static file |

---

## 7. Field-Type Decision Matrix

Not every input in a form is managed by RHF. The following rules determine which approach is used.

| Input Type | Managed By | Reason |
|---|---|---|
| MUI `TextField` (text, email, password) | RHF `Controller` | Direct string value; maps cleanly to Zod `z.string()` |
| MUI `TextField` (multiline / textarea) | RHF `Controller` | Same as above |
| MUI `DatePicker` (Dayjs value) | `useState` + custom validation | Returns a Dayjs object, not a string. Business logic rules (e.g., must be after contract expiry) require Dayjs arithmetic that does not belong in a Zod schema |
| MUI `Autocomplete` | `useState` + manual error state | Returns an object or null; selection logic and loading state require imperative control |
| File input / drag-and-drop | `useState` + `fileError` state | `File` objects cannot be validated by Zod in the browser; file-type and presence checks are done imperatively in the submit handler |
| `RadioGroup` / `Select` | `useState` | Enumerated values with no complex validation; `Controller` adds no benefit |

---

## 8. i18n Integration

Two schemas — `profileSchema.ts` and `loginSchema.ts` — produce error messages in the active locale. The factory function pattern is used:

```typescript
// Schema definition (no React dependency)
export const makeLoginSchema = (t: (key: string) => string) =>
    z.object({
        email: z.string()
            .min(1, { message: t('errorEmailRequired') })
            .email({ message: t('errorEmailInvalid') }),
        password: z.string()
            .min(1, { message: t('errorPasswordRequired') }),
    });
```

```typescript
// Component usage
const t = useTranslations('login');
const loginSchema = useMemo(() => makeLoginSchema(t), [t]);

const { control } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
});
```

`useMemo` ensures the schema object is only reconstructed when the locale changes. On a static page this happens at most once, so there is no performance concern.

Translation keys are maintained in:

- `translations/en.json` — English strings
- `translations/hi.json` — Hindi strings

The schema file itself contains no string literals; it only holds key names. This means adding a new locale requires only a new translation file — no schema changes.

---

## 9. Validation Boundaries

### When validation runs

| Event | Behaviour |
|---|---|
| User types in a field | No validation (field not yet touched) |
| User clicks "Next" / "Submit" | `trigger()` fires for relevant fields; errors appear inline |
| User corrects a field after an error | RHF re-validates that field on each change (real-time feedback) |
| Dialog opens / closes | `reset()` clears all errors; fields return to `defaultValues` |

### What Zod validates vs. what stays imperative

Zod handles: string presence (required), length limits, format (email, regex patterns), date plausibility, cross-field refinements.

Imperative `useState` handles: file presence and MIME type checks, date picker values (Dayjs objects), autocomplete selection state, API-level errors returned from the server.

API errors (e.g., "Team name already exists", "Failed to save") are always displayed through a separate `apiError` / `error` useState and shown in an MUI `Alert` at the top of the form, never through `fieldState.error`. This keeps the distinction clear: Zod owns client-side field validation; the Alert owns server-side feedback.

---

## 10. Error Display Conventions

All field-level errors follow the same display pattern:

```tsx
<Controller
    name="fieldName"
    control={control}
    render={({ field, fieldState }) => (
        <TextField
            {...field}
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            slotProps={{ htmlInput: { maxLength: N } }}
        />
    )}
/>
```

- `error={!!fieldState.error}` turns the TextField border red when invalid.
- `helperText={fieldState.error?.message}` shows the Zod error string below the field. When there is no error, `helperText` is `undefined` and no helper text is rendered (no layout shift when an error appears if a placeholder is needed, a static empty string `''` can be used).
- `slotProps={{ htmlInput: { maxLength: N } }}` enforces the character limit at the DOM level as a secondary safeguard, preventing the Zod max-length error from ever firing in practice.

**Character counters** (notes, team name) combine the counter and the error in `helperText`:

```tsx
helperText={fieldState.error?.message || `${fieldValue.length}/300`}
```

The error takes priority when present; the counter shows when the field is clean.

**API-level errors** are displayed as a standalone `Alert` above the form, not inside any individual field:

```tsx
{apiError && (
    <Alert severity="error" onClose={() => setApiError('')}>
        {apiError}
    </Alert>
)}
```
