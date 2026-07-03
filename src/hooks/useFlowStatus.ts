'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { unifiedFlowService } from '@/services/unifiedFlowService';
import type { FlowStatusResponse } from '@/types/unifiedFlow';

const POLL_INTERVAL_MS = 15_000;

interface UseFlowStatusResult {
    flowStatus: FlowStatusResponse | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

/**
 * Fetches and optionally polls GET /contracts/{id}/flow/status.
 * Pass enabled=false to skip fetching (e.g., when the contract is not in a unified flow).
 */
export function useFlowStatus(
    contractId: string | null | undefined,
    enabled = true,
    poll = false,
): UseFlowStatusResult {
    const [flowStatus, setFlowStatus] = useState<FlowStatusResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetch = useCallback(async () => {
        if (!contractId || !enabled) return;
        setLoading(true);
        setError(null);
        const res = await unifiedFlowService.getFlowStatus(contractId);
        if (res.ok && res.data) {
            setFlowStatus(res.data);
        } else {
            setError(res.message || 'Failed to load flow status');
        }
        setLoading(false);
    }, [contractId, enabled]);

    useEffect(() => {
        fetch();
    }, [fetch]);

    useEffect(() => {
        if (!poll || !enabled) return;
        intervalRef.current = setInterval(fetch, POLL_INTERVAL_MS);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetch, poll, enabled]);

    return { flowStatus, loading, error, refresh: fetch };
}
