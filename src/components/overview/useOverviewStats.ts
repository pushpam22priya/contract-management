'use client';

import { useState, useEffect, useCallback } from 'react';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { Contract, ContractStatus } from '@/types/contract';

export interface OverviewStats {
    draftCount: number;
    underReviewCount: number;
    underApprovalCount: number;
    activeCount: number;
    expiringCount: number;
    expiredCount: number;
    requestedCount: number;
    receivedSignedCount: number;
    waitingForSigCount: number;
    activeContracts: Contract[];
    expiringContracts: Contract[];
    loading: boolean;
    refresh: () => void;
}

export function useOverviewStats(): OverviewStats {
    const [stats, setStats] = useState({
        draftCount: 0,
        underReviewCount: 0,
        underApprovalCount: 0,
        activeCount: 0,
        expiringCount: 0,
        expiredCount: 0,
        requestedCount: 0,
        receivedSignedCount: 0,
        waitingForSigCount: 0,
        activeContracts: [] as Contract[],
        expiringContracts: [] as Contract[],
    });
    const [loading, setLoading] = useState(true);

    const loadStats = useCallback(async () => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) { setLoading(false); return; }

        try {
            const allContracts = await contractService.getAllContracts();
            let draft = 0, underReview = 0, underApproval = 0, active = 0;
            let expiring = 0, expired = 0, requested = 0, receivedSigned = 0, waitingForSig = 0;
            const activeContracts: Contract[] = [];
            const expiringContracts: Contract[] = [];

            if (Array.isArray(allContracts)) {
                const statusById = new Map(allContracts.map(c => [c.id, c.status]));

                allContracts.forEach(c => {
                    const isCreator = c.createdBy === currentUser.email;
                    const isInternalSignerPending = (c.internalSigners || []).some(
                        (s: any) => s.email === currentUser.email && s.status === 'unlocked'
                    );
                    const isLegacySigner = c.signer?.email === currentUser.email;
                    const isValidSignerStatus = ['signed', 'active', 'expiring', 'expired'].includes(c.status);

                    // Collect active / expiring for any visible contract (creator or signer)
                    if (isCreator || (isLegacySigner && isValidSignerStatus) || isInternalSignerPending) {
                        if (c.status === ContractStatus.ACTIVE) activeContracts.push(c);
                        if (c.status === ContractStatus.EXPIRING) expiringContracts.push(c);
                    }

                    if (!isCreator && !isInternalSignerPending && !isLegacySigner) return;

                    if (isCreator) {
                        if (c.status === ContractStatus.DRAFT) draft++;
                        if (c.status === ContractStatus.IN_REVIEW || c.status === ContractStatus.REVIEW_APPROVAL) underReview++;
                        if (c.status === ContractStatus.IN_APPROVAL || c.status === ContractStatus.REVIEWED) underApproval++;
                        if (c.status === ContractStatus.ACTIVE) active++;
                        if (c.status === ContractStatus.EXPIRING) expiring++;
                        if (c.status === ContractStatus.EXPIRED) {
                            let superseded = false;
                            if (c.renewedContractId) {
                                const renewalStatus = statusById.get(c.renewedContractId);
                                const hidden = new Set([
                                    ContractStatus.APPROVED, ContractStatus.READY_FOR_SIGNATURE,
                                    ContractStatus.WAITING_FOR_SIGNATURE, ContractStatus.SIGNED_BY_EVERYONE,
                                    ContractStatus.SIGNED, ContractStatus.ACTIVE, ContractStatus.EXPIRING,
                                    ContractStatus.EXPIRED, ContractStatus.TERMINATED,
                                ]);
                                if (renewalStatus && hidden.has(renewalStatus as ContractStatus)) superseded = true;
                            }
                            if (!superseded) expired++;
                        }
                        if (c.status === ContractStatus.WAITING_FOR_SIGNATURE) requested++;
                        if (c.status === ContractStatus.SIGNED_BY_EVERYONE) receivedSigned++;
                    }
                    if (isInternalSignerPending || (isLegacySigner && c.status === ContractStatus.WAITING_FOR_SIGNATURE)) {
                        waitingForSig++;
                    }
                });
            }

            setStats({
                draftCount: draft, underReviewCount: underReview, underApprovalCount: underApproval,
                activeCount: active, expiringCount: expiring, expiredCount: expired,
                requestedCount: requested, receivedSignedCount: receivedSigned, waitingForSigCount: waitingForSig,
                activeContracts, expiringContracts,
            });
        } catch {
            // silently fail — stats not critical
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadStats(); }, [loadStats]);

    return { ...stats, loading, refresh: loadStats };
}
