'use client';

import { useEffect, useRef, useCallback } from 'react';
import { contractService } from '@/services/contractService';
import { externalSignatureConfig } from '../../config/externalSignature';

/**
 * Custom hook to poll contracts for ANY workflow state change.
 *
 * Tracks each contract's `updatedAt` timestamp. When a change is
 * detected (auto-advance, signer completion, order unlock, etc.)
 * the `onContractChanged` callback fires so the page can reload.
 */
export const useSignaturePolling = (
    contractIds: string[],
    onContractChanged: (contractId: string) => void,
    enabled: boolean = true
) => {
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    /** Map of contractId → last-known updatedAt */
    const snapshotRef = useRef<Record<string, string | undefined>>({});

    const checkSignatures = useCallback(async () => {
        for (const contractId of contractIds) {
            try {
                const result = await contractService.checkExternalSignatureStatus(contractId);

                if (!result.success || !result.contract) continue;

                const freshUpdatedAt = result.contract.updatedAt;
                const previousUpdatedAt = snapshotRef.current[contractId];

                // First time seeing this contract — just record the snapshot
                if (previousUpdatedAt === undefined) {
                    snapshotRef.current[contractId] = freshUpdatedAt;
                    continue;
                }

                // Detect any change via updatedAt comparison
                if (freshUpdatedAt && freshUpdatedAt !== previousUpdatedAt) {
                    console.log(
                        `🔄 [SignaturePolling] Change detected for ${contractId} — ` +
                        `old=${previousUpdatedAt}, new=${freshUpdatedAt}`
                    );
                    snapshotRef.current[contractId] = freshUpdatedAt;
                    onContractChanged(contractId);
                }
            } catch (err) {
                console.warn(`[SignaturePolling] Error checking ${contractId}:`, err);
            }
        }
    }, [contractIds, onContractChanged]);

    // Clean up stale entries when contractIds changes
    useEffect(() => {
        const currentSet = new Set(contractIds);
        for (const key of Object.keys(snapshotRef.current)) {
            if (!currentSet.has(key)) {
                delete snapshotRef.current[key];
            }
        }
    }, [contractIds]);

    useEffect(() => {
        if (!enabled || contractIds.length === 0) {
            return;
        }

        // Initial snapshot capture
        checkSignatures();

        // Set up interval
        intervalRef.current = setInterval(
            checkSignatures,
            externalSignatureConfig.settings.pollIntervalMs
        );

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [enabled, contractIds, checkSignatures]);

    return {
        checkNow: checkSignatures,
    };
};
