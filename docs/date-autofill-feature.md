# Map Document Fields to Today's Date — Feature Documentation

**System:** Contract Management System  
**Module:** Template Profile Field Mapping  
**Scope:** `ProfileFieldMappingDialog` · `profileKeyOptions.ts` · Auto-fill Engine

---

## 1. Overview

Template authors can map any unmapped PDF form field to **today's date**. When a signer opens the document editor and auto-fill runs, those fields are automatically populated with the current date in `DD/MM/YYYY` format — no user interaction required.

This complements the existing profile-key mapping (e.g., `name`, `email`, `panCard`). The two mechanisms are **mutually exclusive**: a field can either be mapped to a profile key or to today's date, never both.

---

## 2. Reserved Key

```typescript
// src/utils/profileKeyOptions.ts
export const DATE_TODAY_KEY = '__date_today__';
```

`DATE_TODAY_KEY` is stored as the `profileKey` value in `FormFieldDefinition` for date-mapped fields. It is:

- **Never shown** in the profile-key dropdown.
- Injected into the profile data map at **auto-fill call time** (not at save time), so the date inserted is always the current day.
- Recognised by the same `autofillFields` engine that handles all other mapped fields — no engine changes were needed.

---

## 3. Data Injection

`buildProfileData()` in `src/utils/profileKeyOptions.ts` constructs the flat `Record<string, string>` consumed by `autofillFields()`. It always injects today's date under `DATE_TODAY_KEY`:

```typescript
export function buildProfileData(user: LoggedInUser): Record<string, string> {
    const options = getProfileKeyOptions(user);
    const data: Record<string, string> = {};
    options.forEach(opt => {
        const raw = (user as unknown as Record<string, unknown>)[opt.value];
        data[opt.value] = raw != null ? String(raw).trim() : '';
    });
    // Inject today's date so fields mapped to DATE_TODAY_KEY are filled at autofill time
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    data[DATE_TODAY_KEY] = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    return data;
}
```

Because the date is computed when `buildProfileData` is called (inside `handleAutofillClick` / `handleAutofill`), multi-day editing sessions always receive the current date the moment the document editor opens — not the date the template was last saved.

---

## 4. Template Mapping UI (`ProfileFieldMappingDialog`)

The mapping dialog (`src/components/template/ProfileFieldMappingDialog.tsx`) presents two sections:

### 4.1 Profile Key Section (existing)

Each mappable field gets a dropdown to select a profile key (Full Name, Email, Department, etc.). Fields with a profile key are **excluded** from the date autocomplete.

### 4.2 "Map to Today's Date" Section (new)

An amber-bordered `<fieldset>` with a `TodayIcon` legend. It contains:

- A short description: *"Selected fields will be automatically filled with the current date (DD/MM/YYYY) when autofill runs. Only fields without a profile key mapping are available."*
- A **multi-select Autocomplete** (`dateAvailableOptions`) showing every mappable field that currently has no profile key set.
- Each option displays a coloured party dot (if assigned) and the party label.
- Selected fields appear as small `Chip` tags inside the input.

```typescript
// Derived values
const dateAvailableOptions = mappableFields.filter((f) => !mappings[f.name]);
const dateMappedFieldObjects = dateMappedFields
    .map((name) => mappableFields.find((f) => f.name === name))
    .filter((f): f is FormFieldDefinition => !!f);
```

---

## 5. Mutual Exclusivity Enforcement

Both mappings share the same field pool. A field cannot have both a profile key and a date mapping simultaneously. Enforcement happens in three places:

| Event | Action |
|---|---|
| User selects a profile key for field X | `handleChange` → removes X from `dateMappedFields` |
| User adds field X to the date Autocomplete | `handleDateMappingChange` → clears `mappings[X]` to `''` |
| Dialog opens with saved data | `useEffect` initialises `dateMappedFields` from `DATE_TODAY_KEY` entries; those fields get `mappings[name] = ''` |

```typescript
const handleChange = (fieldName: string, value: string) => {
    setMappings((prev) => ({ ...prev, [fieldName]: value }));
    if (value) {
        setDateMappedFields((prev) => prev.filter((n) => n !== fieldName));
    }
};

const handleDateMappingChange = (_: React.SyntheticEvent, newValue: FormFieldDefinition[]) => {
    const newNames = newValue.map((f) => f.name);
    setDateMappedFields(newNames);
    setMappings((prev) => {
        const next = { ...prev };
        newNames.forEach((name) => { next[name] = ''; });
        return next;
    });
};
```

---

## 6. Persisting the Mapping (`handleSave`)

When the author clicks **Save Mappings**, each `FormFieldDefinition` is updated:

```typescript
const handleSave = () => {
    const updated = formFields.map((f) => {
        if (f.type === 'signature' || (f.type as string) === 'Sig') return f;
        if (dateMappedFields.includes(f.name)) {
            return { ...f, profileKey: DATE_TODAY_KEY };
        }
        const key = mappings[f.name];
        return { ...f, profileKey: key || null };
    });
    onSave(updated);
};
```

Priority: date mapping takes precedence over profile key if both were somehow set (defensive). Unmapped fields receive `profileKey: null` and are skipped by the auto-fill engine.

---

## 7. Auto-Fill Execution

The existing `autofillFields` engine in `PDFViewerContainer` handles date-mapped fields transparently:

1. `buildProfileData(currentUser)` includes `data['__date_today__'] = 'DD/MM/YYYY'`.
2. For a field with `profileKey = '__date_today__'`, the engine looks up `profileData['__date_today__']` and finds today's date.
3. The field passes all guards (not signature, not read-only, not already filled, correct party, has profile key, has matching value) and is written via `field.setValue(todayDate)`.

No changes were required to the `autofillFields` engine. See `docs/autofill-architecture.md` for the full engine specification.

---

## 8. Edge Cases

| Scenario | Behaviour |
|---|---|
| All fields already have profile keys | Date Autocomplete shows `noOptionsText`: *"All fields are already mapped to a profile key"* |
| Field is later mapped to a profile key | Removed from date Autocomplete; `dateMappedFields` state cleared for that field |
| Field is date-mapped and later cleared from Autocomplete | `dateMappedFields` state no longer includes it; field reverts to unmapped (no profile key) |
| Signature fields | Filtered out of `mappableFields`; never shown in either section |
| Multi-day editing | Date is always computed at auto-fill execution time from `new Date()`, not at template-save time |
| Document opened without autofill running | Field is empty; value is not inserted until next autofill trigger |

---

## 9. Data Flow

```
Template author opens ProfileFieldMappingDialog
       │
       ├── Selects fields in "Map to Today's Date" Autocomplete
       │       └── handleDateMappingChange: dateMappedFields updated, profile keys cleared
       │
       └── Clicks "Save Mappings"
               └── handleSave: fields with date mapping get profileKey = DATE_TODAY_KEY
                       └── persisted to template.formFields[]

─────────────────────────────────────────────────────

Signer opens document editor
       │
       ▼
onDocumentLoaded → auto-fill triggers (silent mode)
       │
       ▼
buildProfileData(currentUser)
       │   includes: data['__date_today__'] = 'DD/MM/YYYY'
       │
       ▼
autofillFields(partyId, profileData)
       │
       for each field where profileKey === '__date_today__':
       └── setValue('DD/MM/YYYY') → redraw → onFieldChange
       │
       ▼
Success snackbar: "N fields filled from your profile"
```
