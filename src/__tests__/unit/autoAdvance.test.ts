/**
 * UNIT TESTS — autoAdvanceWorkflow  (src/lib/workflow/autoAdvance.ts)
 *
 * This engine runs SERVER-SIDE after every signer completes.  It reads the
 * latest contract state from MongoDB and either:
 *   a) does nothing (current order is not yet fully signed), OR
 *   b) unlocks the next order's signers, OR
 *   c) marks the contract as all_completed when no more orders exist.
 *
 * These tests mock the MongoDB Db object so no real database is needed.
 *
 * Scenarios covered:
 *  1.  Contract not found in DB           → returns early, no update
 *  2.  Contract already all_completed     → returns early, no update
 *  3.  Contract already finalized         → returns early, no update
 *  4.  No currentSigningOrder on contract → returns early, no update
 *  5.  Current order not fully done       → does not advance
 *  6.  Mixed order: internal done but external still pending → does not advance
 *  7.  All signers at current order done, no next order → marks all_completed
 *  8.  All signers at current order done, next order exists → unlocks next order
 *  9.  Next order has external signers → returns them for email delivery
 *  10. Next order is internal-only → returns empty newlyUnlockedExternal
 */

import { autoAdvanceWorkflow } from '@/lib/workflow/autoAdvance';

// ─── DB mock factory ──────────────────────────────────────────────────────────
// Returns a fake MongoDB Db whose collection().findOne() and collection().updateOne()
// can be controlled per test.

function makeDb(contractOrNull: Record<string, any> | null) {
    const findOne = jest.fn().mockResolvedValue(contractOrNull);
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const collection = jest.fn().mockReturnValue({ findOne, updateOne });
    return {
        db: { collection } as any,
        findOne,
        updateOne,
    };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONTRACT_ID = '507f1f77bcf86cd799439011'; // valid 24-char hex ObjectId

function baseContract(overrides: Record<string, any> = {}) {
    return {
        signatureFlowStatus: 'pending_signatures',
        currentSigningOrder: 1,
        internalSigners: [],
        externalSigners: [],
        partyCompletions: [],
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('autoAdvanceWorkflow — early-exit cases', () => {

    it('returns {advanced:false} without touching the DB when the contract is not found', async () => {
        /**
         * WHAT WE'RE TESTING:
         * If the contract was deleted between the signer completing and autoAdvance
         * running, the function should bail out gracefully without crashing or updating.
         */

        const { db, updateOne } = makeDb(null);
        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(false);
        expect(result.newlyUnlockedExternal).toHaveLength(0);
        expect(updateOne).not.toHaveBeenCalled();
    });

    it('returns {advanced:false} when the contract is already all_completed', async () => {
        const { db, updateOne } = makeDb(
            baseContract({ signatureFlowStatus: 'all_completed' })
        );

        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(false);
        expect(updateOne).not.toHaveBeenCalled();
    });

    it('returns {advanced:false} when the contract is already finalized', async () => {
        const { db, updateOne } = makeDb(
            baseContract({ signatureFlowStatus: 'finalized' })
        );

        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(false);
        expect(updateOne).not.toHaveBeenCalled();
    });

    it('returns {advanced:false} when the contract has no currentSigningOrder', async () => {
        /**
         * WHAT WE'RE TESTING:
         * Contracts that never had signing configured (no currentSigningOrder) should
         * not be processed by the workflow engine.
         */

        const { db, updateOne } = makeDb(
            baseContract({ currentSigningOrder: null })
        );

        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(false);
        expect(updateOne).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('autoAdvanceWorkflow — order not yet complete', () => {

    it('does not advance when an external signer at the current order is still pending', async () => {
        /**
         * WHAT WE'RE TESTING:
         * Order 1 has one external signer who is 'unlocked' (has been emailed) but
         * hasn't signed yet. The workflow should wait.
         */

        const { db, updateOne } = makeDb(
            baseContract({
                currentSigningOrder: 1,
                externalSigners: [
                    { order: 1, status: 'unlocked', email: 'buyer@test.com', token: 'tok1', name: 'Buyer', partyLabel: 'Buyer' },
                ],
            })
        );

        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(false);
        expect(result.newlyUnlockedExternal).toHaveLength(0);
        expect(updateOne).not.toHaveBeenCalled();
    });

    it('does not advance when internal signer is done but external at same order is still pending', async () => {
        /**
         * WHAT WE'RE TESTING:
         * BOTH internal AND external signers at order 1 must complete before the
         * workflow advances to order 2. Completing only one side is not enough.
         */

        const { db, updateOne } = makeDb(
            baseContract({
                currentSigningOrder: 1,
                internalSigners: [
                    { order: 1, status: 'completed', email: 'internal@company.com' },
                ],
                externalSigners: [
                    { order: 1, status: 'unlocked', email: 'buyer@test.com', token: 'tok1', name: 'Buyer', partyLabel: 'Buyer' },
                ],
            })
        );

        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(false);
        expect(updateOne).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('autoAdvanceWorkflow — advancing the workflow', () => {

    it('marks the contract all_completed when all signers at the only order are done', async () => {
        /**
         * WHAT WE'RE TESTING:
         * When there is only one order (order 1) and all signers complete it,
         * there is no "next" order. The contract should be marked all_completed.
         *
         * KEY ASSERTION: updateOne is called with signatureFlowStatus: 'all_completed'
         */

        const { db, updateOne } = makeDb(
            baseContract({
                currentSigningOrder: 1,
                externalSigners: [
                    { order: 1, status: 'completed', email: 'buyer@test.com', token: 'tok1', name: 'Buyer', partyLabel: 'Buyer' },
                ],
            })
        );

        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(true);
        expect(result.newlyUnlockedExternal).toHaveLength(0);
        expect(updateOne).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                $set: expect.objectContaining({
                    signatureFlowStatus: 'all_completed',
                    status: 'signed_by_everyone',
                    currentSigningOrder: null,
                }),
            })
        );
    });

    it('unlocks order 2 and returns external signers when order 1 completes', async () => {
        /**
         * WHAT WE'RE TESTING:
         * After order 1's signer completes, the engine should:
         *  - Set currentSigningOrder to 2
         *  - Unlock order 2 signers (status: 'pending' → 'unlocked')
         *  - Return the unlocked external signer in newlyUnlockedExternal
         *    so the API route can email them
         */

        const { db, updateOne } = makeDb(
            baseContract({
                currentSigningOrder: 1,
                externalSigners: [
                    { order: 1, status: 'completed', email: 'buyer@test.com', token: 'tok1', name: 'Buyer', partyLabel: 'Buyer' },
                    { order: 2, status: 'pending', email: 'seller@test.com', token: 'tok2', name: 'Seller', partyLabel: 'Seller' },
                ],
            })
        );

        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(true);

        // The seller (order 2) should now need an email
        expect(result.newlyUnlockedExternal).toHaveLength(1);
        expect(result.newlyUnlockedExternal[0]).toMatchObject({
            email: 'seller@test.com',
            token: 'tok2',
            name: 'Seller',
            partyLabel: 'Seller',
        });

        // DB should have been updated to order 2
        expect(updateOne).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                $set: expect.objectContaining({ currentSigningOrder: 2 }),
            })
        );
    });

    it('returns empty newlyUnlockedExternal when only internal signers are at the next order', async () => {
        /**
         * WHAT WE'RE TESTING:
         * If order 2 has only an internal signer (not external), the workflow advances
         * but returns no external signers — the internal signer is notified in-app,
         * not by email.
         */

        const { db, updateOne } = makeDb(
            baseContract({
                currentSigningOrder: 1,
                externalSigners: [
                    { order: 1, status: 'completed', email: 'buyer@test.com', token: 'tok1', name: 'Buyer', partyLabel: 'Buyer' },
                ],
                internalSigners: [
                    { order: 2, status: 'pending', email: 'internal@company.com' },
                ],
            })
        );

        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(true);
        expect(result.newlyUnlockedExternal).toHaveLength(0);
        expect(updateOne).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                $set: expect.objectContaining({ currentSigningOrder: 2 }),
            })
        );
    });

    it('advances skipping non-contiguous orders (order 1 → order 3 with no order 2)', async () => {
        /**
         * WHAT WE'RE TESTING:
         * If signers are assigned orders 1 and 3 (but not 2), the engine should
         * advance directly from 1 to 3. Order numbers don't have to be consecutive.
         */

        const { db, updateOne } = makeDb(
            baseContract({
                currentSigningOrder: 1,
                externalSigners: [
                    { order: 1, status: 'completed', email: 'buyer@test.com', token: 'tok1', name: 'Buyer', partyLabel: 'Buyer' },
                    { order: 3, status: 'pending', email: 'third@test.com', token: 'tok3', name: 'Third', partyLabel: 'Third' },
                ],
            })
        );

        const result = await autoAdvanceWorkflow(db, CONTRACT_ID);

        expect(result.advanced).toBe(true);
        expect(result.newlyUnlockedExternal[0].email).toBe('third@test.com');
        expect(updateOne).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                $set: expect.objectContaining({ currentSigningOrder: 3 }),
            })
        );
    });
});
