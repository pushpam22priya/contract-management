'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import EmptyState from '@/components/common/EmptyState';
import { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import ContractCard from '@/components/contracts/ContractCard';
import ContractHistoryPanel from '@/components/contracts/ContractHistoryPanel';
import ContractHistoryDialog from '@/components/contracts/ContractHistoryDialog';
import DeleteContractDialog from '@/components/contracts/DeleteContractDialog';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
// import ReusableFilter from '@/components/common/ReusableFilter';
import CompactFilter from '@/components/common/CompactFilter';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { categoryService } from '@/services/categoryService';
import { Contract, ContractStatus } from '@/types/contract';
import type { HistoryEntry } from '@/components/contracts/ContractHistoryPanel';
import type { FilterOption } from '@/components/common/ReusableFilter';
import { useTranslations } from 'next-intl';

export default function TerminatedContractsPage() {
    const t = useTranslations('terminated');
    const tFilters = useTranslations('filters');
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<FilterOption[]>([{ label: 'All Categories', value: 'all' }]);
    const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([{ label: 'All Categories', value: 'all' }]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // History panel state
    const [historyAnchorEl, setHistoryAnchorEl] = useState<HTMLElement | null>(null);
    const [historyContractId, setHistoryContractId] = useState<string | null>(null);
    const [historyDialogEntry, setHistoryDialogEntry] = useState<HistoryEntry | null>(null);

    // Delete dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [contractForDeletion, setContractForDeletion] = useState<Contract | null>(null);

    const loadContracts = useCallback(async () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();
        if (!currentUser) { setContracts([]); setLoading(false); return; }

        try {
            const allContracts = await contractService.getAllContracts();
            if (!Array.isArray(allContracts)) { setContracts([]); setLoading(false); return; }

            const statusById = new Map(allContracts.map(c => [c.id, c.status]));

            // Only show the "head" of each terminated chain — hide prior versions
            // that are superseded by a newer terminated contract in the same chain.
            const terminated = allContracts.filter(c => {
                if (c.createdBy !== currentUser.email) return false;
                if (c.status !== ContractStatus.TERMINATED) return false;
                if (c.renewedFromId) {
                    const parentStatus = statusById.get(c.renewedFromId);
                    return parentStatus !== ContractStatus.TERMINATED;
                }
                return true;
            });

            setContracts(terminated);
        } catch {
            setContracts([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadContracts();
        // Load categories for the dropdown
        const cats = categoryService.getAllCategories();
        setCategoryOptions([
            { label: 'All Categories', value: 'all' },
            ...cats.map(c => ({ label: c.name, value: c.name })),
        ]);
    }, [loadContracts]);

    // Client-side filtering
    const filteredContracts = contracts.filter(contract => {
        const matchesSearch = searchQuery === '' ||
            contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (contract.client || '').toLowerCase().includes(searchQuery.toLowerCase());

        const matchesCategory =
            categoryFilter.some(f => f.value === 'all') ||
            categoryFilter.some(f => f.value === contract.category);

        let matchesDate = true;
        if (contract.terminatedAt && (startDate || endDate)) {
            const d = dayjs(contract.terminatedAt);
            if (startDate && d.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && d.isAfter(endDate, 'day')) matchesDate = false;
        }

        return matchesSearch && matchesCategory && matchesDate;
    });

    const hasActiveFilters =
        searchQuery !== '' ||
        categoryFilter.every(f => f.value !== 'all') ||
        startDate !== null ||
        endDate !== null;

    const handleClearFilters = () => {
        setSearchQuery('');
        setCategoryFilter([{ label: 'All Categories', value: 'all' }]);
        setStartDate(null);
        setEndDate(null);
        setShowAdvancedFilters(false);
    };

    return (
        <AppLayout>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Page Header */}
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    bgcolor: 'background.paper',
                    px: 2,
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h5">
                            {t('title')}
                        </Typography>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                            {loading ? t('loading') : t('description')}
                        </Typography>
                    </Box>
                </Box>

                {/* Reusable Filter */}
                {/* <ReusableFilter */}
                <CompactFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={tFilters('searchByTitle')}
                    filters={[
                        {
                            label: tFilters('category'),
                            value: categoryFilter,
                            onChange: (val) => setCategoryFilter(val || [{ label: tFilters('allCategories'), value: 'all' }]),
                            options: categoryOptions,
                            multiple: true,
                        },
                    ]}
                    enableDateFilter={true}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    showAdvancedFilters={showAdvancedFilters}
                    onAdvancedFiltersToggle={() => setShowAdvancedFilters(p => !p)}
                    dateFilterTitle="Filter by Termination Date Range"
                    filteredCount={filteredContracts.length}
                    totalCount={contracts.length}
                    countLabel={tFilters('countContracts')}
                    hasActiveFilters={hasActiveFilters}
                    onClearFilters={handleClearFilters}
                />

                {/* Card Grid */}
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1 }}>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
                        gap: 0.75,
                    }}
                >
                    {loading ? (
                        <ShimmerCardGrid count={8} variant="contract" />
                    ) : filteredContracts.length === 0 ? (
                        <Box sx={{ gridColumn: '1 / -1' }}>
                            <EmptyState
                                icon={<BlockOutlinedIcon />}
                                title={hasActiveFilters ? t('noContractsFiltered') : t('noContracts')}
                                description={hasActiveFilters ? t('tryAdjusting') : t('appearHere')}
                                sx={{ minHeight: '55vh' }}
                            />
                        </Box>
                    ) : (
                        filteredContracts.map(contract => (
                            <ContractCard
                                key={contract.id}
                                variant="terminated"
                                contract={contract}
                                onHistory={(id, event) => {
                                    setHistoryContractId(id);
                                    setHistoryAnchorEl(event.currentTarget);
                                }}
                                onDelete={(id) => {
                                    const c = contracts.find(x => x.id === id) || null;
                                    setContractForDeletion(c);
                                    setDeleteDialogOpen(true);
                                }}
                            />
                        ))
                    )}
                </Box>
                </Box>
            </Box>

            {/* Contract History Panel */}
            <ContractHistoryPanel
                open={Boolean(historyAnchorEl)}
                anchorEl={historyAnchorEl}
                onClose={() => setHistoryAnchorEl(null)}
                contractId={historyContractId || ''}
                currentContractId={historyContractId || ''}
                onSelectEntry={(entry) => setHistoryDialogEntry(entry)}
            />

            {/* History detail dialog */}
            <ContractHistoryDialog
                open={!!historyDialogEntry}
                onClose={() => setHistoryDialogEntry(null)}
                entry={historyDialogEntry}
                currentContractId={historyContractId || ''}
            />

            {/* Delete confirmation dialog */}
            <DeleteContractDialog
                open={deleteDialogOpen}
                onClose={() => { setDeleteDialogOpen(false); setContractForDeletion(null); }}
                contractId={contractForDeletion?.id || ''}
                contractTitle={contractForDeletion?.title?.replace(/\s*\(Renewal\d*\)$/i, '') || ''}
                onSuccess={loadContracts}
            />
        </AppLayout>
    );
}
