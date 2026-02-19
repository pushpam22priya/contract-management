import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';
import { ContractStatus } from '@/types/contract';
// Note: 'request' parameter in GET/POST is required by Next.js route handler signature

/**
 * Calculate dynamic contract status based on dates
 * Logic:
 * - If contract is in a workflow status (draft, review_approval, reviewed, approved, waiting_for_signature, rejected), keep it
 * - If contract was signed:
 *   - If startDate hasn't arrived yet -> SIGNED (signed but not started)
 *   - If current date is between startDate and endDate:
 *     - If more than 30 days until endDate -> ACTIVE
 *     - If 30 or less days until endDate -> EXPIRING
 *   - If current date is past endDate -> EXPIRED
 */
function calculateDynamicStatus(contract: any): { status: ContractStatus; expiresInDays: number } {
    const workflowStatuses = [
        ContractStatus.DRAFT,
        ContractStatus.REVIEW_APPROVAL,
        ContractStatus.REVIEWED,
        ContractStatus.APPROVED,
        ContractStatus.WAITING_FOR_SIGNATURE,
        ContractStatus.REJECTED
    ];

    // If contract has been sent for signatures, override status dynamically
    if (contract.signatureFlowStatus === 'pending_signatures' || contract.signatureFlowStatus === 'all_completed') {
        let expiresInDays = contract.expiresInDays || 0;
        if (contract.endDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const endDate = new Date(contract.endDate);
            endDate.setHours(0, 0, 0, 0);
            expiresInDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
        const dynamicStatus = contract.signatureFlowStatus === 'all_completed'
            ? ContractStatus.SIGNED_BY_EVERYONE
            : ContractStatus.WAITING_FOR_SIGNATURE;
        return { status: dynamicStatus, expiresInDays };
    }

    // If contract is still in workflow, don't change status
    if (workflowStatuses.includes(contract.status)) {
        // Calculate expiresInDays based on endDate if available
        let expiresInDays = contract.expiresInDays || 0;
        if (contract.endDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const endDate = new Date(contract.endDate);
            endDate.setHours(0, 0, 0, 0);
            expiresInDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
        return { status: contract.status, expiresInDays };
    }

    // For signed contracts, calculate status based on dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = contract.startDate ? new Date(contract.startDate) : null;
    const endDate = contract.endDate ? new Date(contract.endDate) : null;

    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(0, 0, 0, 0);

    // Calculate days until expiry
    let expiresInDays = 0;
    if (endDate) {
        expiresInDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Determine status based on dates
    let status: ContractStatus = contract.status;

    // Only calculate dynamic status for contracts that have been signed
    const signedStatuses = [
        ContractStatus.SIGNED,
        ContractStatus.ACTIVE,
        ContractStatus.EXPIRING,
        ContractStatus.EXPIRED
    ];
    if (signedStatuses.includes(contract.status) || contract.signer?.status === 'signed') {

        // Check if contract duration hasn't started yet
        if (startDate && today < startDate) {
            status = ContractStatus.SIGNED; // Signed but not yet active
        }
        // Check if contract has expired
        else if (endDate && today > endDate) {
            status = ContractStatus.EXPIRED;
        }
        // Check if contract is expiring (30 days or less)
        else if (endDate && expiresInDays <= 30 && expiresInDays >= 0) {
            status = ContractStatus.EXPIRING;
        }
        // Contract is active (started and more than 30 days until end)
        else if (startDate && today >= startDate) {
            status = ContractStatus.ACTIVE;
        }
        // Fallback: if no startDate but signed, consider it active
        else if (!startDate && contract.signer?.status === 'signed') {
            status = ContractStatus.ACTIVE;
        }
    }

    return { status, expiresInDays };
}

export async function GET(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();

        // Use URL params to filter if needed, or just return all for demo
        const contracts = await db.collection('contracts')
            .find({})
            .project({ pdf: 0, fileData: 0, signedPdfBase64: 0 })
            .sort({ createdAt: -1 })
            .toArray();

        const mappedContracts = contracts.map(c => {
            // Calculate dynamic status based on dates
            const { status, expiresInDays } = calculateDynamicStatus(c);

            return {
                ...c,
                id: c._id.toString(),
                // URL to fetch the contract PDF
                fileUrl: `/api/file/${c._id.toString()}?type=contract`,
                // Apply calculated status and expiresInDays
                status,
                expiresInDays,
                _id: undefined
            };
        });

        return NextResponse.json(mappedContracts);
    } catch (e) {
        console.error('Failed to fetch contracts:', e);
        return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const data = await request.json();

        const newContract = {
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: data.status || 'draft',
            // Ensure binary fields are null initially
            pdf: null,
        };

        const result = await db.collection('contracts').insertOne(newContract);

        return NextResponse.json({
            success: true,
            id: result.insertedId.toString(),
            message: 'Contract metadata created.'
        });

    } catch (e) {
        console.error('Failed to create contract:', e);
        return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 });
    }
}
