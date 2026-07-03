'use client';

import { useState, useEffect, useCallback } from 'react';
import { unifiedFlowService } from '@/services/unifiedFlowService';
import type { Contract } from '@/types/contract';

interface UseUnifiedFlowInboxResult {
    contracts: Contract[];
    loading: boolean;
    error: string | null;
    reload: () => void;
}

/** Fetches all contracts where the current user is an active unified-flow participant. */
export function useUnifiedFlowInbox(): UseUnifiedFlowInboxResult {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const res = await unifiedFlowService.getFlowInbox();
        if (res.ok && Array.isArray(res.data)) {
            setContracts(res.data);
        } else {
            setError(res.message || 'Failed to load unified flow inbox');
            setContracts([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { contracts, loading, error, reload: load };
}
