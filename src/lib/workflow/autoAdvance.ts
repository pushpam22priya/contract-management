/**
 * Auto-Advance Workflow Engine
 *
 * Called server-side after any signer (internal or external) completes their
 * signing. Reads the latest contract state, checks whether every signer at
 * the current order has finished, and if so:
 *   - Unlocks the next order's signers in MongoDB, OR
 *   - Marks the contract fully complete when no more orders remain.
 *
 * Email notifications to external signers are NOT sent here.
 * Instead, the list of newly-unlocked external signers is returned so the
 * calling API route can include it in its response. The client (signatures
 * page / sign page) then sends the emails using the existing working
 * client-side EmailJS setup (@emailjs/browser).
 *
 * This replaces the manual "Unlock Next Order" button that the contractor
 * previously had to click from the contract detail page.
 */

import { Db } from 'mongodb';
import { ObjectId } from 'mongodb';

export interface UnlockedExternalSigner {
    email: string;
    token: string;
    name: string;
    partyLabel: string;
}

export interface AutoAdvanceResult {
    /** Whether the workflow actually advanced (or completed) */
    advanced: boolean;
    /** Newly unlocked external signers who need to receive a signing email */
    newlyUnlockedExternal: UnlockedExternalSigner[];
}

/**
 * Auto-advance the contract's signing workflow to the next order.
 *
 * Called from:
 *   POST /api/contracts/[id]/internal-sign   — after an internal signer saves
 *   PUT  /api/sign-requests/[token]/complete — after an external signer submits
 *
 * The function reads fresh state from MongoDB so it always acts on the
 * committed result of the caller's update — no stale in-memory snapshots.
 *
 * Returns the list of external signers that were just unlocked so the API
 * route can forward that list to the client for email delivery.
 */
export async function autoAdvanceWorkflow(
    db: Db,
    contractId: string
): Promise<AutoAdvanceResult> {
    const empty: AutoAdvanceResult = { advanced: false, newlyUnlockedExternal: [] };

    console.log(`🔄 [AutoAdvance] Evaluating workflow for contract: ${contractId}`);

    // 1. Read the latest contract state
    const contract = await db.collection('contracts').findOne(
        { _id: new ObjectId(contractId) },
        { projection: { pdf: 0, signedPdfBase64: 0, fileData: 0 } }
    );

    if (!contract) {
        console.warn(`⚠️ [AutoAdvance] Contract ${contractId} not found`);
        return empty;
    }

    // Skip if already fully completed or finalized
    if (
        contract.signatureFlowStatus === 'all_completed' ||
        contract.signatureFlowStatus === 'finalized'
    ) {
        console.log(`ℹ️ [AutoAdvance] Contract already '${contract.signatureFlowStatus}' — nothing to do`);
        return empty;
    }

    const currentOrder: number | null | undefined = contract.currentSigningOrder;
    if (currentOrder === null || currentOrder === undefined) {
        console.log(`ℹ️ [AutoAdvance] No currentSigningOrder on contract — skipping`);
        return empty;
    }

    const internalSigners: any[] = contract.internalSigners || [];
    const externalSigners: any[] = contract.externalSigners || [];
    const partyCompletions: any[] = contract.partyCompletions || [];

    // 2. Check whether every signer at the current order has completed
    const internalAtOrder = internalSigners.filter((s) => s.order === currentOrder);
    const externalAtOrder = externalSigners.filter((s) => s.order === currentOrder);

    const allInternalDone = internalAtOrder.every((s) => s.status === 'completed');
    const allExternalDone = externalAtOrder.every((s) => s.status === 'completed');

    console.log(
        `   Order ${currentOrder}: ${internalAtOrder.length} internal (done=${allInternalDone}), ` +
        `${externalAtOrder.length} external (done=${allExternalDone})`
    );

    if (!allInternalDone || !allExternalDone) {
        console.log(`   Order ${currentOrder} not yet complete — no auto-advance`);
        return empty;
    }

    // 3. Find the next order
    const allOrders = [
        ...new Set([
            ...internalSigners.map((s) => Number(s.order)),
            ...externalSigners.map((s) => Number(s.order)),
        ]),
    ].sort((a, b) => a - b);

    const nextOrder = allOrders.find((o) => o > currentOrder);
    const now = new Date().toISOString();

    // 4a. No next order → entire signing flow is done
    if (nextOrder === undefined) {
        console.log(`🎉 [AutoAdvance] All orders complete — marking contract as all_completed`);
        await db.collection('contracts').updateOne(
            { _id: new ObjectId(contractId) },
            {
                $set: {
                    signatureFlowStatus: 'all_completed',
                    status: 'signed_by_everyone',
                    currentSigningOrder: null,
                    updatedAt: now,
                },
            }
        );
        return { advanced: true, newlyUnlockedExternal: [] };
    }

    // 4b. Unlock signers at the next order
    console.log(`➡️ [AutoAdvance] Auto-unlocking order ${nextOrder}`);

    const updatedInternalSigners = internalSigners.map((s) =>
        s.order === nextOrder && s.status === 'pending'
            ? { ...s, status: 'unlocked', unlockedAt: now }
            : s
    );

    const updatedExternalSigners = externalSigners.map((s) =>
        s.order === nextOrder && s.status === 'pending'
            ? { ...s, status: 'unlocked', unlockedAt: now }
            : s
    );

    const updatedPartyCompletions = partyCompletions.map((pc: any) =>
        pc.order === nextOrder && pc.status === 'pending'
            ? { ...pc, status: 'unlocked' }
            : pc
    );

    await db.collection('contracts').updateOne(
        { _id: new ObjectId(contractId) },
        {
            $set: {
                currentSigningOrder: nextOrder,
                internalSigners: updatedInternalSigners,
                externalSigners: updatedExternalSigners,
                partyCompletions: updatedPartyCompletions,
                updatedAt: now,
            },
        }
    );

    console.log(`✅ [AutoAdvance] Order ${nextOrder} unlocked successfully`);

    // 5. Collect the newly unlocked external signers so the client can email them
    const newlyUnlockedExternal: UnlockedExternalSigner[] = updatedExternalSigners
        .filter((s) => s.order === nextOrder && s.status === 'unlocked')
        .map((s) => ({
            email: s.email as string,
            token: s.token as string,
            name: (s.name || '') as string,
            partyLabel: (s.partyLabel || '') as string,
        }));

    if (newlyUnlockedExternal.length > 0) {
        console.log(
            `📧 [AutoAdvance] ${newlyUnlockedExternal.length} external signer(s) at order ${nextOrder} ` +
            `need email — returning to client for delivery`
        );
    }

    const internalUnlocked = updatedInternalSigners.filter(
        (s) => s.order === nextOrder && s.status === 'unlocked'
    );
    if (internalUnlocked.length > 0) {
        console.log(
            `🔓 [AutoAdvance] ${internalUnlocked.length} internal signer(s) at order ${nextOrder} are now unlocked`
        );
    }

    return { advanced: true, newlyUnlockedExternal };
}
