'use client';

import { useEffect, useRef, useCallback } from 'react';
import { contractService } from '@/services/contractService';
import { externalSignatureConfig } from '../../config/externalSignature';
// import { externalSignatureConfig } from '@/config/externalSignature';

/**
 * Custom hook to poll for external signature updates.
 * 
 * Use this on the contracts page to automatically detect when
 * a client has signed a contract.
 */
export const useSignaturePolling = (
    contractIds: string[],
    onSignatureComplete: (contractId: string) => void,
    enabled: boolean = true
) => {
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const checkSignatures = useCallback(async () => {
        console.log('🔄 [SignaturePolling] Checking for signature updates...');
        console.log('🔄 [SignaturePolling] Checking', contractIds.length, 'contracts');

        for (const contractId of contractIds) {
            const result = await contractService.checkExternalSignatureStatus(contractId);
            
            if (result.success && result.signed) {
                console.log('🎉 [SignaturePolling] Signature detected for:', contractId);
                onSignatureComplete(contractId);
            }
        }
    }, [contractIds, onSignatureComplete]);

    useEffect(() => {
        if (!enabled || contractIds.length === 0) {
            console.log('⏸️ [SignaturePolling] Polling disabled or no contracts to check');
            return;
        }

        console.log('▶️ [SignaturePolling] Starting polling...');
        console.log('▶️ [SignaturePolling] Interval:', externalSignatureConfig.settings.pollIntervalMs, 'ms');

        // Initial check
        checkSignatures();

        // Set up interval
        intervalRef.current = setInterval(
            checkSignatures,
            externalSignatureConfig.settings.pollIntervalMs
        );

        return () => {
            if (intervalRef.current) {
                console.log('⏹️ [SignaturePolling] Stopping polling');
                clearInterval(intervalRef.current);
            }
        };
    }, [enabled, contractIds, checkSignatures]);

    return {
        checkNow: checkSignatures,
    };
};
