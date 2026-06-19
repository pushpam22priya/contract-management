/**
 * UNIT TESTS — Pure Signing Logic
 *
 * These functions are extracted from the component into standalone pure functions
 * so they can be tested without rendering any UI.
 * Pure function = same input always gives same output, no side effects.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PURE FUNCTIONS (mirror the useMemo logic from sign/[token]/page.tsx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors: const editableParties = useMemo(...)
 * Given a signer's assigned party, returns which parties they can edit.
 */
function computeEditableParties(
    assignedParty: string | string[] | null | undefined
): string[] | undefined {
    if (!assignedParty) return undefined;
    return Array.isArray(assignedParty) ? assignedParty : [assignedParty];
}

/**
 * Mirrors: const protectedPartyIds = useMemo(...)
 * Returns all party IDs EXCEPT the signer's own — these are "locked" parties.
 */
function computeProtectedPartyIds(
    assignedParty: string | string[] | null | undefined,
    allParties: { id: string }[]
): string[] | undefined {
    if (!assignedParty || allParties.length === 0) return undefined;

    const userPartyIds = Array.isArray(assignedParty) ? assignedParty : [assignedParty];
    return allParties.map(p => p.id).filter(id => !userPartyIds.includes(id));
}

/**
 * Mirrors: the startOrder logic in MultiPartySignatureDialog
 * Orders are globally unique across the contract lifetime — always continue
 * from the highest existing order + 1, regardless of completion status.
 */
function computeStartOrder(
    existingSigners: { status: string; order: number }[]
): number {
    if (existingSigners.length === 0) return 1;
    const maxOrder = existingSigners.reduce((max, s) => Math.max(max, s.order), 0);
    return maxOrder + 1;
}

/**
 * Mirrors: contractorFilledPartyIds logic in MultiPartySignatureDialog
 * A party is "contractor-filled" when ALL of its fields already have values.
 */
function computeContractorFilledPartyIds(
    parties: { id: string }[],
    formFields: { assignedParty: string; name: string }[],
    fieldValues: Record<string, string>
): string[] {
    return parties
        .filter(party => {
            const partyFields = formFields.filter(f => f.assignedParty === party.id);
            if (partyFields.length === 0) return false;
            return partyFields.every(f => {
                const val = fieldValues[f.name];
                return val !== undefined && val !== null && val !== '';
            });
        })
        .map(p => p.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST FIXTURES — reusable test data
// ─────────────────────────────────────────────────────────────────────────────

const mockParties = [
    { id: 'party_buyer', label: 'Buyer', color: '#4CAF50', order: 1 },
    { id: 'party_seller', label: 'Seller', color: '#2196F3', order: 2 },
    { id: 'party_witness', label: 'Witness', color: '#FF9800', order: 3 },
];

const mockFormFields = [
    { name: 'BuyerName', assignedParty: 'party_buyer' },
    { name: 'BuyerEmail', assignedParty: 'party_buyer' },
    { name: 'SellerName', assignedParty: 'party_seller' },
    { name: 'WitnessName', assignedParty: 'party_witness' },
];

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 1 — editableParties
// ─────────────────────────────────────────────────────────────────────────────

describe('computeEditableParties', () => {

    it('returns an array with the single assigned party ID', () => {
        // When assignedParty is a plain string, wrap it in an array
        const result = computeEditableParties('party_buyer');
        expect(result).toEqual(['party_buyer']);
    });

    it('returns the array as-is when assignedParty is already an array', () => {
        // Some signers may be assigned multiple parties
        const result = computeEditableParties(['party_buyer', 'party_seller']);
        expect(result).toEqual(['party_buyer', 'party_seller']);
    });

    it('returns undefined when assignedParty is null', () => {
        // null means legacy mode — no restriction, signer edits all fields
        const result = computeEditableParties(null);
        expect(result).toBeUndefined();
    });

    it('returns undefined when assignedParty is undefined', () => {
        const result = computeEditableParties(undefined);
        expect(result).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 2 — protectedPartyIds
// ─────────────────────────────────────────────────────────────────────────────

describe('computeProtectedPartyIds', () => {

    it('returns all other party IDs except the signer\'s assigned party', () => {
        // Buyer is signing → Seller and Witness signatures must be protected
        const result = computeProtectedPartyIds('party_buyer', mockParties);
        expect(result).toEqual(['party_seller', 'party_witness']);
    });

    it('excludes multiple assigned parties from the protected list', () => {
        // If a signer is assigned both Buyer and Seller, only Witness is protected
        const result = computeProtectedPartyIds(
            ['party_buyer', 'party_seller'],
            mockParties
        );
        expect(result).toEqual(['party_witness']);
    });

    it('returns undefined when assignedParty is null (legacy mode)', () => {
        // No party restriction → nothing to protect
        const result = computeProtectedPartyIds(null, mockParties);
        expect(result).toBeUndefined();
    });

    it('returns undefined when there are no parties', () => {
        const result = computeProtectedPartyIds('party_buyer', []);
        expect(result).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 3 — signing order reset logic
// ─────────────────────────────────────────────────────────────────────────────

describe('computeStartOrder', () => {

    it('returns 1 when there are no existing signers', () => {
        // First share ever — start at order 1
        expect(computeStartOrder([])).toBe(1);
    });

    it('returns maxOrder + 1 when ALL existing signers have completed (linear chain continues)', () => {
        // All previous signers are done — no round reset; continue the chain from order 3
        const signers = [
            { status: 'completed', order: 1 },
            { status: 'completed', order: 2 },
        ];
        expect(computeStartOrder(signers)).toBe(3);
    });

    it('returns existingMaxOrder + 1 when some signers have not completed', () => {
        // Signing still in progress at order 2 → new signer gets order 3
        const signers = [
            { status: 'completed', order: 1 },
            { status: 'unlocked', order: 2 },
        ];
        expect(computeStartOrder(signers)).toBe(3);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 4 — contractor-filled party detection
// ─────────────────────────────────────────────────────────────────────────────

describe('computeContractorFilledPartyIds', () => {

    it('returns a party ID when ALL its fields have values', () => {
        // Contractor pre-filled both Buyer fields → Buyer party is "filled"
        const fieldValues = {
            BuyerName: 'John Doe',
            BuyerEmail: 'john@example.com',
        };
        const result = computeContractorFilledPartyIds(mockParties, mockFormFields, fieldValues);
        expect(result).toContain('party_buyer');
    });

    it('does NOT mark a party as filled when only some fields have values', () => {
        // Contractor only filled BuyerName, left BuyerEmail empty → not fully filled
        const fieldValues = { BuyerName: 'John Doe' };
        const result = computeContractorFilledPartyIds(mockParties, mockFormFields, fieldValues);
        expect(result).not.toContain('party_buyer');
    });

    it('returns empty array when no fields have values', () => {
        const result = computeContractorFilledPartyIds(mockParties, mockFormFields, {});
        expect(result).toHaveLength(0);
    });

    it('can mark multiple parties as filled at the same time', () => {
        // Both Buyer and Seller fully pre-filled by contractor
        const fieldValues = {
            BuyerName: 'John Doe',
            BuyerEmail: 'john@example.com',
            SellerName: 'Jane Smith',
        };
        const result = computeContractorFilledPartyIds(mockParties, mockFormFields, fieldValues);
        expect(result).toContain('party_buyer');
        expect(result).toContain('party_seller');
        expect(result).not.toContain('party_witness'); // WitnessName still empty
    });
});
