'use client';

import { useEffect, useRef, useCallback } from 'react';
import { apiService } from '@/services/apiService';

/**
 * Custom hook to poll a single contract for any workflow state changes.
 *
 * Compares the contract's `updatedAt` timestamp on every tick.
 * When a change is detected the fresh contract data is passed to `onUpdate`.
 *
 * Use this on the contract detail page so the contractor sees auto-advance
 * transitions (order unlocking, signer status changes, etc.) without reloading.
 */
export const useContractPolling = (
    contractId: string | null | undefined,
    currentUpdatedAt: string | null | undefined,
    onUpdate: (contract: any) => void,
    enabled: boolean = true,
    intervalMs: number = 12000
) => {
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastKnownUpdatedAt = useRef<string | null | undefined>(currentUpdatedAt);

    // Keep the ref in sync with the latest prop value
    useEffect(() => {
        lastKnownUpdatedAt.current = currentUpdatedAt;
    }, [currentUpdatedAt]);

    const checkForUpdates = useCallback(async () => {
        if (!contractId) return;

        try {
            const fresh = await apiService.getContractDetails(contractId);
            if (!fresh) return;

            // Compare updatedAt timestamps to detect any change
            if (fresh.updatedAt && fresh.updatedAt !== lastKnownUpdatedAt.current) {
                console.log(
                    `🔄 [ContractPolling] Change detected for ${contractId} — ` +
                    `old=${lastKnownUpdatedAt.current}, new=${fresh.updatedAt}`
                );
                lastKnownUpdatedAt.current = fresh.updatedAt;
                onUpdate(fresh);
            }
        } catch (err) {
            console.warn('[ContractPolling] Error fetching contract:', err);
        }
    }, [contractId, onUpdate]);

    useEffect(() => {
        if (!enabled || !contractId) {
            return;
        }

        // Initial check after a short delay (let the page settle)
        const initialTimeout = setTimeout(checkForUpdates, 2000);

        // Set up interval
        intervalRef.current = setInterval(checkForUpdates, intervalMs);

        return () => {
            clearTimeout(initialTimeout);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [enabled, contractId, checkForUpdates, intervalMs]);

    return {
        checkNow: checkForUpdates,
    };
};
