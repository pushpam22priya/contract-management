'use client';

import { Box, keyframes } from '@mui/material';

/**
 * Shimmer animation keyframes
 */
const shimmer = keyframes`
    0% {
        background-position: -400px 0;
    }
    100% {
        background-position: 400px 0;
    }
`;

/**
 * A single shimmer rectangle placeholder
 */
const ShimmerBlock = ({
    width = '100%',
    height = 14,
    borderRadius = 4,
    mb = 0,
}: {
    width?: string | number;
    height?: number;
    borderRadius?: number;
    mb?: number;
}) => (
    <Box
        sx={{
            width,
            height,
            borderRadius: `${borderRadius}px`,
            background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
            backgroundSize: '800px 100%',
            animation: `${shimmer} 1.5s ease-in-out infinite`,
            mb,
        }}
    />
);

/**
 * Variant presets that match the actual card layouts
 */
interface ShimmerCardProps {
    /** 'contract' matches ContractCard / DraftCard layout. 'template' matches TemplateCard layout. */
    variant?: 'contract' | 'template';
}

/**
 * Shimmer card for ContractCard / DraftCard layout:
 * - Title line + status chip (header row)
 * - Description line
 * - Three small detail blocks (client, category, expires)
 */
const ContractShimmer = () => (
    <Box
        sx={{
            bgcolor: 'background.paper',
            borderRadius: 3,
            p: 2,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
        }}
    >
        {/* Header: title + status chip */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <ShimmerBlock width="55%" height={18} borderRadius={4} />
            <ShimmerBlock width="80px" height={24} borderRadius={12} />
        </Box>

        {/* Description */}
        <ShimmerBlock width="85%" height={12} borderRadius={4} mb={1.5} />

        {/* Details grid: client, category, expires */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
            {[0, 1, 2].map((i) => (
                <Box key={i}>
                    <ShimmerBlock width="60%" height={10} borderRadius={3} mb={0.5} />
                    <ShimmerBlock width="80%" height={12} borderRadius={3} />
                </Box>
            ))}
        </Box>
    </Box>
);

/**
 * Shimmer card for TemplateCard layout:
 * - Icon box + category chip (header row)
 * - Title line
 * - Description lines
 */
const TemplateShimmer = () => (
    <Box
        sx={{
            bgcolor: 'white',
            borderRadius: 2.5,
            p: 2,
            border: '1px solid',
            borderColor: 'rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
        }}
    >
        {/* Header: icon + category chip */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
            <ShimmerBlock width={40} height={40} borderRadius={8} />
            <ShimmerBlock width="70px" height={24} borderRadius={12} />
        </Box>

        {/* Title */}
        <ShimmerBlock width="70%" height={16} borderRadius={4} mb={0.75} />

        {/* Description */}
        <ShimmerBlock width="90%" height={12} borderRadius={4} mb={0.5} />
        <ShimmerBlock width="60%" height={12} borderRadius={4} />
    </Box>
);

/**
 * ShimmerCard — reusable loading placeholder card.
 *
 * @param variant - 'contract' for ContractCard/DraftCard, 'template' for TemplateCard
 */
export default function ShimmerCard({ variant = 'contract' }: ShimmerCardProps) {
    return variant === 'template' ? <TemplateShimmer /> : <ContractShimmer />;
}

/**
 * Renders a grid of shimmer cards. Drop this into the same grid container.
 *
 * @param count - Number of shimmer cards to render (default 8)
 * @param variant - Card variant to mimic
 */
export function ShimmerCardGrid({
    count = 8,
    variant = 'contract',
}: {
    count?: number;
    variant?: 'contract' | 'template';
}) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <ShimmerCard key={`shimmer-${i}`} variant={variant} />
            ))}
        </>
    );
}

/**
 * Shimmer card for ReviewApprovalCard layout:
 * - Colored header bar (status text + category chip)
 * - Title, client, description
 * - Action icon buttons row
 */
const ReviewApprovalShimmerCard = () => (
    <Box
        sx={{
            border: '1px solid',
            borderColor: 'rgba(0, 0, 0, 0.08)',
            borderRadius: 2.5,
            bgcolor: 'white',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        }}
    >
        {/* Colored header bar */}
        <Box
            sx={{
                p: 1.5,
                background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                backgroundSize: '800px 100%',
                animation: `${shimmer} 1.5s ease-in-out infinite`,
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}
        >
            <ShimmerBlock width="120px" height={14} borderRadius={3} />
            <ShimmerBlock width="60px" height={20} borderRadius={10} />
        </Box>

        {/* Content */}
        <Box sx={{ p: 2 }}>
            {/* Title */}
            <ShimmerBlock width="70%" height={16} borderRadius={4} mb={1} />

            {/* Client */}
            <ShimmerBlock width="50%" height={12} borderRadius={3} mb={1} />

            {/* Description */}
            <ShimmerBlock width="90%" height={11} borderRadius={3} mb={0.5} />
            <ShimmerBlock width="65%" height={11} borderRadius={3} mb={2} />

            {/* Action buttons row */}
            <Box sx={{ display: 'flex', gap: 1 }}>
                {[0, 1, 2].map((i) => (
                    <ShimmerBlock key={i} width={32} height={32} borderRadius={16} />
                ))}
            </Box>
        </Box>
    </Box>
);

/**
 * Renders a grid of review/approval shimmer cards.
 */
export function ReviewApprovalShimmerGrid({ count = 6 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <ReviewApprovalShimmerCard key={`ra-shimmer-${i}`} />
            ))}
        </>
    );
}

/**
 * Full-page shimmer for the Contract Detail page (/contracts/[id]).
 * Mimics: header (back + title + chip), left panel (ContractInformation), right panel (tabs + activity).
 */
export function ContractDetailShimmer() {
    return (
        <Box>
            {/* Header: back button + title + status chip */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    pb: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}
            >
                <ShimmerBlock width={36} height={36} borderRadius={18} />
                <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <ShimmerBlock width="30%" height={20} borderRadius={4} />
                        <ShimmerBlock width="70px" height={24} borderRadius={12} />
                    </Box>
                    <ShimmerBlock width="45%" height={14} borderRadius={4} />
                </Box>
            </Box>

            {/* Two-panel content grid */}
            <Box
                sx={{
                    mt: 1.5,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', lg: '1.5fr 1fr' },
                    gap: 2,
                }}
            >
                {/* Left Panel: Contract Information */}
                <Box
                    sx={{
                        bgcolor: 'background.paper',
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        p: 2.5,
                    }}
                >
                    {/* Section title */}
                    <ShimmerBlock width="50%" height={18} borderRadius={4} mb={2} />

                    {/* Info fields grid (2 columns × 3 rows) */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mb: 2 }}>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <Box key={i}>
                                <ShimmerBlock width="40%" height={10} borderRadius={3} mb={0.5} />
                                <ShimmerBlock width="70%" height={14} borderRadius={3} />
                            </Box>
                        ))}
                    </Box>

                    {/* Divider line */}
                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 2 }} />

                    {/* Description */}
                    <ShimmerBlock width="30%" height={10} borderRadius={3} mb={0.75} />
                    <ShimmerBlock width="90%" height={14} borderRadius={4} mb={0.5} />
                    <ShimmerBlock width="60%" height={14} borderRadius={4} mb={2} />

                    {/* Divider line */}
                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 2 }} />

                    {/* Progress bar */}
                    <ShimmerBlock width="35%" height={10} borderRadius={3} mb={1} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                        <ShimmerBlock width="40%" height={12} borderRadius={3} />
                        <ShimmerBlock width="80px" height={12} borderRadius={3} />
                    </Box>
                    <ShimmerBlock width="100%" height={8} borderRadius={4} />
                </Box>

                {/* Right Panel: Details (Tabs + Activity) */}
                <Box
                    sx={{
                        bgcolor: 'background.paper',
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        p: 2.5,
                    }}
                >
                    {/* Tab buttons */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
                        <ShimmerBlock width="100px" height={32} borderRadius={6} />
                        <ShimmerBlock width="80px" height={32} borderRadius={6} />
                    </Box>

                    {/* Activity list items */}
                    {[0, 1, 2, 3].map((i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                            <ShimmerBlock width={10} height={10} borderRadius={5} />
                            <Box sx={{ flex: 1 }}>
                                <ShimmerBlock width="60%" height={14} borderRadius={4} mb={0.5} />
                                <ShimmerBlock width="80%" height={11} borderRadius={3} />
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}
