# Teams (Folders) Feature — Implementation Plan

## Overview

Introduce a **Teams** layer above contracts. A Team is a folder that groups contracts. Both the **Contracts** page and the **Draft** page show teams — each page filters the team's contracts by the statuses relevant to that page. A contract belongs to exactly one team via a `teamId` field.

---

## 1. User Flow

```
/contracts (root)
  └── Shows team cards  [+ "Create Team" button]
       └── Click team card → /contracts?team=<teamId>
            └── Shows contracts in that team with contract-page statuses
                 └── "Create Contract" button visible → normal contract flow

/draft (root)
  └── Shows same team cards  (only teams that have ≥1 draft-status contract)
       └── Click team card → /draft?team=<teamId>
            └── Shows contracts in that team with draft-page statuses
```

### Key rules
- A team card **always appears on the Contracts page** as long as the team exists — even if it has zero contracts inside. Teams are created here, so they must always be visible.
- A team card appears on the **Draft page** only if that team has at least one contract with a draft-relevant status.
- The same team (e.g. "abc") can appear on both pages simultaneously.
- Inside a team on the Contracts page → shows only contract-status contracts for that team.
- Inside a team on the Draft page → shows only draft-status contracts for that team.
- Contracts created inside a team inherit that team's `teamId` automatically.

---

## 2. MongoDB Changes

### 2a. New Collection — `teams`

```js
{
  _id: ObjectId,
  name: String,          // max 50 chars
  createdBy: String,     // email of creator
  createdAt: Date,
  updatedAt: Date
}
```

Index: `{ createdBy: 1 }` (query teams by owner)

### 2b. Contracts Collection — new field

Add one field to each contract document:

```js
teamId: String | null    // _id of the team (null = no team / root level)
```

- Existing contracts → `teamId: null` (unchanged behaviour, backward compatible)
- New contracts created inside a team → `teamId` set to that team's `_id` string

**No other contract fields change.**

---

## 3. New API Routes — `/api/teams`

### `GET /api/teams`
- Returns all teams created by the current user (identified via query param `?createdBy=email`).
- Response:
  ```json
  [{ "_id": "...", "name": "abc", "createdBy": "...", "createdAt": "..." }]
  ```

### `POST /api/teams`
- Body: `{ name: string, createdBy: string }`
- Validates:
  - `name` required, trimmed, not empty
  - `name` max 50 chars
  - **Unique per user**: if a team with the same name (case-insensitive) already exists for that `createdBy`, return `400` with `{ error: "A team with this name already exists" }`
- Returns: `{ success: true, id: "...", team: { _id, name, createdBy, createdAt } }`

### `PATCH /api/teams/[id]`
- Body: `{ name: string }`
- Validates:
  - Same as POST (required, max 50 chars, trimmed)
  - **Unique per user**: same case-insensitive duplicate check, excluding the team being renamed
- Returns: `{ success: true }` or `{ error: "A team with this name already exists" }`

### `DELETE /api/teams/[id]`  *(optional — include for completeness)*
- Only allowed if zero contracts belong to this team
- Returns: `{ success: true }` or `{ error: "Team has contracts" }`

---

## 4. Modified Existing API Routes

### `GET /api/contracts`
- **No change to signature**
- The contracts page/draft page will filter by `teamId` client-side after fetching, or pass `?teamId=xxx` as query param for server-side filtering (server-side is cleaner and more scalable — recommended)
- Add optional query param: `?teamId=<id>` → adds `{ teamId: id }` to the MongoDB query

### `POST /api/contracts`
- Accept one additional optional field in the body: `teamId?: string`
- Store it on the contract document as-is (null if not provided)

---

## 5. Type Changes

### `src/types/contract.ts`
Add one optional field to the `Contract` interface:
```typescript
teamId?: string | null;   // Which team this contract belongs to
```

### New file: `src/types/team.ts`
```typescript
export interface Team {
  _id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}
```

---

## 6. New Components

### `src/components/teams/CreateTeamDialog.tsx`
- Uses `BaseDialog` (`maxWidth="xs"`)
- Single `TextField`: "Team Name" with `inputProps={{ maxLength: 50 }}`
- Character counter shown below input (e.g. `12 / 50`)
- Buttons: Cancel | Create Team
- On submit: calls `POST /api/teams`, then triggers parent refresh

### `src/components/teams/RenameTeamDialog.tsx`
- Uses `BaseDialog` (`maxWidth="xs"`)
- Same TextField but pre-filled with current name
- Buttons: Cancel | Save
- On submit: calls `PATCH /api/teams/[id]`

### `src/components/teams/TeamCard.tsx`
- Visually similar to `ContractCard` card shape
- Shows: folder icon + team name + contract count badge
- **Hover action buttons** (same overlay mechanism as ContractCard):
  - Eye icon (`VisibilityOutlined`) → navigate into the team
  - Pen icon (`EditOutlined`) → open `RenameTeamDialog`
- Entire card is also clickable → navigate into the team
- Props:
  ```typescript
  interface TeamCardProps {
    team: Team;
    contractCount: number;   // count of relevant-status contracts in this team
    onRename: (team: Team) => void;
    onClick: (teamId: string) => void;
  }
  ```

---

## 7. Page Changes

### `src/app/contracts/page.tsx`

**Root level (no team selected):**
- Replace "Create Contract" button → "Create Team" button (opens `CreateTeamDialog`)
- Fetch teams via `GET /api/teams?createdBy=email`
- Fetch all user's contracts (existing logic)
- For each team, count how many contracts in that team have a **contract-page status**
- Render `TeamCard` components for **all teams** (even those with 0 contracts)
- Existing filter/search UI remains completely unchanged

**Inside a team (`?team=<teamId>` query param in URL):**
- Show breadcrumb path: `Contracts > Team Name`
- Show "← Back" link to return to root
- Show "Create Contract" button (normal contract flow — passes `teamId` when creating)
- Fetch contracts filtered by `teamId` + contract-page statuses
- Render `ContractCard` components as currently

**State management:**
- Use `useSearchParams()` from `next/navigation` to read `?team=` param
- Use `router.push('/contracts?team=<id>')` to navigate into a team
- Use `router.push('/contracts')` to go back to root

### `src/app/draft/page.tsx`

Same pattern as above:
- Root level: shows `TeamCard` components (teams with ≥1 draft-status contract)
- No "Create Team" button here (teams are created from Contracts page)
- Inside team (`?team=<teamId>`): shows draft-status contracts for that team
- Breadcrumb: `Drafts > Team Name`

---

## 8. Create Contract Dialog Changes

### `src/components/contracts/CreateContractDialog.tsx`
- Accept a new optional prop: `teamId?: string`
- Pass `teamId` in the POST body when creating a contract:
  ```typescript
  { ...existingFields, teamId: teamId || null }
  ```
- No UI change needed — the team context is inherited from the page the user is already in

---

## 9. Navigation Path Summary

| Current URL | State | Behaviour |
|-------------|-------|-----------|
| `/contracts` | Root | Shows team cards (contract-status) + "Create Team" button |
| `/contracts?team=abc123` | Inside team | Shows contract-status contracts for that team + "Create Contract" |
| `/draft` | Root | Shows team cards (draft-status) |
| `/draft?team=abc123` | Inside team | Shows draft-status contracts for that team |
| `/contracts/[id]` | Contract detail | Unchanged |
| `/sign/[token]` | External signer | Unchanged |

---

## 10. What Does NOT Change

- `ContractCard` component — unchanged
- All contract API routes (`/api/contracts/[id]/*`) — unchanged
- Multi-party signing flow — unchanged
- Auto-advance workflow — unchanged
- External signer flow — unchanged
- `DocumentViewerDialog` — unchanged
- Draft page save/edit flow — unchanged
- Review & Approval flow — unchanged
- Sidebar navigation — unchanged (same menu items)

---

## 11. Backward Compatibility

- Existing contracts have `teamId: null` (no team) — they will NOT appear in any team folder
- If the app previously had contracts without `teamId`, they simply won't appear at the team-folder level
- **Option:** Show a "No Team" virtual folder at the root level that contains `teamId: null` contracts — this can be a Phase 2 addition
- Existing pages continue to work if `?team=` param is absent

---

## 12. File Change Summary

| File | Change Type | What Changes |
|------|------------|--------------|
| `src/types/contract.ts` | Modify | Add `teamId?: string \| null` |
| `src/types/team.ts` | **New** | `Team` interface |
| `src/app/api/teams/route.ts` | **New** | GET + POST handlers |
| `src/app/api/teams/[id]/route.ts` | **New** | PATCH + DELETE handlers |
| `src/app/api/contracts/route.ts` | Modify | Accept `?teamId` query param, accept `teamId` in POST body |
| `src/components/teams/TeamCard.tsx` | **New** | Folder card with hover actions |
| `src/components/teams/CreateTeamDialog.tsx` | **New** | Create team dialog |
| `src/components/teams/RenameTeamDialog.tsx` | **New** | Rename team dialog |
| `src/app/contracts/page.tsx` | Modify | Team-level view + inside-team view |
| `src/app/draft/page.tsx` | Modify | Team-level view + inside-team view |
| `src/components/contracts/CreateContractDialog.tsx` | Modify | Accept + pass `teamId` prop |

**Total new files: 5 | Modified files: 6**

---

## 13. Implementation Order

1. `src/types/team.ts` — type definition
2. `src/types/contract.ts` — add `teamId`
3. `src/app/api/teams/route.ts` — GET + POST
4. `src/app/api/teams/[id]/route.ts` — PATCH + DELETE
5. `src/app/api/contracts/route.ts` — add `teamId` filter support
6. `src/components/teams/CreateTeamDialog.tsx`
7. `src/components/teams/RenameTeamDialog.tsx`
8. `src/components/teams/TeamCard.tsx`
9. `src/components/contracts/CreateContractDialog.tsx` — add `teamId` prop
10. `src/app/contracts/page.tsx` — team-aware root + inside-team views
11. `src/app/draft/page.tsx` — team-aware root + inside-team views
