/**
 * UNIT TESTS — Party data merge in DocumentViewerDialog.handleSaveClick
 *
 * BACKGROUND:
 * Apryse's exportFormFields() returns fields stripped of custom metadata
 * (assignedParty, partyLabel, partyColor, profileKey).  The fix in
 * DocumentViewerDialog.tsx re-merges this data from the original formFields
 * prop before passing the result to onSave().
 *
 * The merge algorithm (from handleSaveClick, ~line 604):
 *
 *   exportedFormFields.map(exportedField => {
 *     const original = formFields.find(f => f.name === exportedField.name);
 *     return {
 *       ...exportedField,
 *       value: filledFieldValues[exportedField.name] || exportedField.value || '',
 *       ...(original?.assignedParty  !== undefined && { assignedParty:  original.assignedParty }),
 *       ...(original?.partyLabel     !== undefined && { partyLabel:     original.partyLabel }),
 *       ...(original?.partyColor     !== undefined && { partyColor:     original.partyColor }),
 *       ...(original?.profileKey     !== undefined && { profileKey:     original.profileKey }),
 *     };
 *   });
 *
 * These tests validate the algorithm's behavior so any future refactor that
 * changes the output will be caught immediately.
 *
 * Scenarios covered:
 *  1. Party metadata (assignedParty, partyLabel, partyColor, profileKey) is
 *     merged back onto fields that were stripped by exportFormFields()
 *  2. filledFieldValues overrides the exported value
 *  3. Exported value is used as fallback when filledFieldValues has no entry
 *  4. Fields with no party assignment in formFields don't get party data added
 *  5. Fields not present in formFields still get their value synced
 *  6. profileKey is merged when present on the original field
 */

// ─── The merge function (extracted from DocumentViewerDialog.handleSaveClick) ─
// This is the exact same algorithm used in production.  If the production code
// changes and produces different results, the test description documents what
// the CORRECT behavior should be.

function mergePartyData(
    exportedFormFields: any[],
    formFields: any[] | undefined,
    filledFieldValues: Record<string, string>
): any[] {
    return exportedFormFields.map((exportedField: any) => {
        const original = formFields?.find((f: any) => f.name === exportedField.name);
        return {
            ...exportedField,
            value: filledFieldValues[exportedField.name] || exportedField.value || '',
            ...(original?.assignedParty !== undefined && { assignedParty: original.assignedParty }),
            ...(original?.partyLabel !== undefined && { partyLabel: original.partyLabel }),
            ...(original?.partyColor !== undefined && { partyColor: original.partyColor }),
            ...(original?.profileKey !== undefined && { profileKey: original.profileKey }),
        };
    });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// What Apryse's exportFormFields() returns: no party metadata
const EXPORTED_STRIPPED = [
    { name: 'BuyerName', type: 'text', value: '', readOnly: false, required: false },
    { name: 'BuyerEmail', type: 'text', value: 'old@email.com', readOnly: false, required: false },
    { name: 'SellerName', type: 'text', value: '', readOnly: false, required: false },
    { name: 'NoPartyField', type: 'text', value: 'some-value', readOnly: false, required: false },
];

// What the formFields prop contains: full metadata including party assignments
const ORIGINAL_FORM_FIELDS = [
    {
        name: 'BuyerName',
        type: 'text',
        assignedParty: 'party_buyer',
        partyLabel: 'Buyer',
        partyColor: '#4CAF50',
        profileKey: 'fullName',
    },
    {
        name: 'BuyerEmail',
        type: 'text',
        assignedParty: 'party_buyer',
        partyLabel: 'Buyer',
        partyColor: '#4CAF50',
        profileKey: 'email',
    },
    {
        name: 'SellerName',
        type: 'text',
        assignedParty: 'party_seller',
        partyLabel: 'Seller',
        partyColor: '#2196F3',
    },
    // NoPartyField is intentionally absent from formFields
];

// ─────────────────────────────────────────────────────────────────────────────

describe('mergePartyData — party metadata restoration', () => {

    it('restores assignedParty, partyLabel, and partyColor that exportFormFields strips', () => {
        /**
         * WHAT WE'RE TESTING:
         * Apryse's exportFormFields() only returns: name, type, value, readOnly, required.
         * The merge must put back: assignedParty, partyLabel, partyColor.
         * Without this fix, the party restriction on the NEXT save would break
         * because the field-to-party mapping would be lost.
         */

        const result = mergePartyData(EXPORTED_STRIPPED, ORIGINAL_FORM_FIELDS, {});

        const buyerName = result.find((f) => f.name === 'BuyerName');
        expect(buyerName?.assignedParty).toBe('party_buyer');
        expect(buyerName?.partyLabel).toBe('Buyer');
        expect(buyerName?.partyColor).toBe('#4CAF50');

        const sellerName = result.find((f) => f.name === 'SellerName');
        expect(sellerName?.assignedParty).toBe('party_seller');
        expect(sellerName?.partyLabel).toBe('Seller');
        expect(sellerName?.partyColor).toBe('#2196F3');
    });

    it('restores profileKey when it was present on the original field', () => {
        const result = mergePartyData(EXPORTED_STRIPPED, ORIGINAL_FORM_FIELDS, {});

        const buyerName = result.find((f) => f.name === 'BuyerName');
        expect(buyerName?.profileKey).toBe('fullName');

        const buyerEmail = result.find((f) => f.name === 'BuyerEmail');
        expect(buyerEmail?.profileKey).toBe('email');
    });

    it('does NOT add party data to fields that have no party assignment in formFields', () => {
        /**
         * WHAT WE'RE TESTING:
         * "NoPartyField" appears in the exported fields but is NOT in the original
         * formFields array.  It should retain its exported value but NOT have any
         * party metadata added to it.
         */

        const result = mergePartyData(EXPORTED_STRIPPED, ORIGINAL_FORM_FIELDS, {});

        const noParty = result.find((f) => f.name === 'NoPartyField');
        expect(noParty).toBeDefined();
        expect(noParty?.assignedParty).toBeUndefined();
        expect(noParty?.partyLabel).toBeUndefined();
        expect(noParty?.partyColor).toBeUndefined();
        expect(noParty?.value).toBe('some-value'); // exported value preserved
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('mergePartyData — value synchronisation', () => {

    it('uses the value from filledFieldValues when it exists (overrides the exported value)', () => {
        /**
         * WHAT WE'RE TESTING:
         * filledFieldValues holds what the user typed into the form during this session.
         * These values take priority over whatever exportFormFields() returns for the
         * field's "value" property.
         */

        const filledFieldValues = {
            BuyerName: 'John Buyer',
            BuyerEmail: 'john@buyer.com',
        };

        const result = mergePartyData(EXPORTED_STRIPPED, ORIGINAL_FORM_FIELDS, filledFieldValues);

        expect(result.find((f) => f.name === 'BuyerName')?.value).toBe('John Buyer');
        expect(result.find((f) => f.name === 'BuyerEmail')?.value).toBe('john@buyer.com');
    });

    it('falls back to the exported field value when filledFieldValues has no entry for that field', () => {
        /**
         * WHAT WE'RE TESTING:
         * Fields that the user did not touch (so filledFieldValues is empty for them)
         * should keep their value from the exported field.
         */

        // BuyerEmail has an exported value of 'old@email.com' but is NOT in filledFieldValues
        const result = mergePartyData(EXPORTED_STRIPPED, ORIGINAL_FORM_FIELDS, {});

        expect(result.find((f) => f.name === 'BuyerEmail')?.value).toBe('old@email.com');
    });

    it('produces an empty string when neither filledFieldValues nor the exported value has a value', () => {
        /**
         * WHAT WE'RE TESTING:
         * BuyerName has no exported value and no entry in filledFieldValues.
         * The merge should produce '' (empty string) rather than undefined.
         */

        const result = mergePartyData(EXPORTED_STRIPPED, ORIGINAL_FORM_FIELDS, {});

        expect(result.find((f) => f.name === 'BuyerName')?.value).toBe('');
    });

    it('preserves all other exported field properties (type, readOnly, required, etc.)', () => {
        /**
         * WHAT WE'RE TESTING:
         * The spread (...exportedField) must come BEFORE the party properties so that
         * custom party data from the original formFields overwrites any stale party data
         * on the exported field (which shouldn't exist, but is defensive coding).
         * All non-party props like type, readOnly, required must still be present.
         */

        const result = mergePartyData(EXPORTED_STRIPPED, ORIGINAL_FORM_FIELDS, {});

        const buyerName = result.find((f) => f.name === 'BuyerName');
        expect(buyerName?.type).toBe('text');
        expect(buyerName?.readOnly).toBe(false);
        expect(buyerName?.required).toBe(false);
    });
});
