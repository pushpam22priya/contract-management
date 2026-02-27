/**
 * API Route: POST /api/contracts/[id]/unlock-order
 *
 * Unlocks the next signing order for a multi-party contract.
 * Called by the contractor after verifying previous order is complete.
 *
 * - Validates current order signers are complete
 * - Unlocks signers at the next order
 * - Sends email notifications to external signers at next order
 * - Updates contract's currentSigningOrder
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { unlockedBy } = body;

        console.log(`🔓 [UnlockOrder] Processing unlock request for contract: ${id}`);
        console.log(`   Requested by: ${unlockedBy}`);

        const { db } = await connectToDatabase();

        // 1. Fetch the contract
        const contract = await db.collection('contracts').findOne(
            { _id: new ObjectId(id) },
            { projection: { pdf: 0, signedPdfBase64: 0 } }
        );

        if (!contract) {
            console.log(`❌ [UnlockOrder] Contract not found: ${id}`);
            return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
        }

        const currentOrder = contract.currentSigningOrder;
        const internalSigners = contract.internalSigners || [];
        const externalSigners = contract.externalSigners || [];
        const partyCompletions = contract.partyCompletions || [];

        console.log(`   Current order: ${currentOrder}`);

        // 2. Verify all signers at current order are complete
        const internalAtCurrentOrder = internalSigners.filter((s: any) => s.order === currentOrder);
        const externalAtCurrentOrder = externalSigners.filter((s: any) => s.order === currentOrder);

        const allInternalComplete = internalAtCurrentOrder.every((s: any) => s.status === 'completed');
        const allExternalComplete = externalAtCurrentOrder.every((s: any) => s.status === 'completed');

        if (!allInternalComplete || !allExternalComplete) {
            console.log(`❌ [UnlockOrder] Not all signers at order ${currentOrder} are complete`);
            const pendingInternal = internalAtCurrentOrder.filter((s: any) => s.status !== 'completed');
            const pendingExternal = externalAtCurrentOrder.filter((s: any) => s.status !== 'completed');
            return NextResponse.json({
                success: false,
                error: `Cannot unlock next order. Pending signers at order ${currentOrder}`,
                pendingSigners: {
                    internal: pendingInternal.map((s: any) => s.email),
                    external: pendingExternal.map((s: any) => s.email),
                }
            }, { status: 400 });
        }

        // 3. Find the next order
        const allOrders = [
            ...internalSigners.map((s: any) => s.order),
            ...externalSigners.map((s: any) => s.order),
        ];
        const uniqueOrders = [...new Set(allOrders)].sort((a, b) => a - b);
        const nextOrder = uniqueOrders.find((o: number) => o > currentOrder);

        if (!nextOrder) {
            // All orders completed - mark as all_completed
            console.log(`🎉 [UnlockOrder] All orders completed!`);
            await db.collection('contracts').updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        signatureFlowStatus: 'all_completed',
                        currentSigningOrder: null,
                        updatedAt: new Date().toISOString(),
                    }
                }
            );
            return NextResponse.json({
                success: true,
                message: 'All signing orders completed!',
                allComplete: true,
            });
        }

        console.log(`➡️ [UnlockOrder] Unlocking order ${nextOrder}`);
        const now = new Date().toISOString();

        // 4. Unlock signers at next order
        const updatedInternalSigners = internalSigners.map((s: any) => {
            if (s.order === nextOrder && s.status === 'pending') {
                return { ...s, status: 'unlocked', unlockedAt: now };
            }
            return s;
        });

        const updatedExternalSigners = externalSigners.map((s: any) => {
            if (s.order === nextOrder && s.status === 'pending') {
                return { ...s, status: 'unlocked', unlockedAt: now };
            }
            return s;
        });

        const updatedPartyCompletions = partyCompletions.map((pc: any) => {
            if (pc.order === nextOrder && pc.status === 'pending') {
                return { ...pc, status: 'unlocked' };
            }
            return pc;
        });

        // 5. Update contract
        await db.collection('contracts').updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    currentSigningOrder: nextOrder,
                    internalSigners: updatedInternalSigners,
                    externalSigners: updatedExternalSigners,
                    partyCompletions: updatedPartyCompletions,
                    updatedAt: now,
                }
            }
        );

        console.log(`✅ [UnlockOrder] Order ${nextOrder} unlocked successfully`);

        // 6. Collect external signers at next order that need email notification
        const unlockedExternalSigners = updatedExternalSigners
            .filter((s: any) => s.order === nextOrder && s.status === 'unlocked')
            .map((s: any) => ({
                email: s.email,
                name: s.name,
                token: s.token,
                partyLabel: s.partyLabel,
            }));

        // 7. Collect internal signers at next order for response
        const unlockedInternalSigners = updatedInternalSigners
            .filter((s: any) => s.order === nextOrder && s.status === 'unlocked')
            .map((s: any) => ({
                email: s.email,
                name: s.name,
                partyLabel: s.partyLabel,
            }));

        return NextResponse.json({
            success: true,
            message: `Order ${nextOrder} unlocked successfully`,
            unlockedOrder: nextOrder,
            unlockedExternalSigners,
            unlockedInternalSigners,
            contractTitle: contract.title,
        });

    } catch (error: any) {
        console.error('❌ [UnlockOrder] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
