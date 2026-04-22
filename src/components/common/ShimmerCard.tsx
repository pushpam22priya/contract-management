'use client';

import { Box, keyframes, useTheme } from '@mui/material';

const shimmer = keyframes`
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
`;

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
}) => {
    const theme = useTheme();
    const { base, highlight } = theme.shimmer;
    return (
        <Box
            sx={{
                width,
                height,
                borderRadius: `${borderRadius}px`,
                background: `linear-gradient(90deg, ${base} 25%, ${highlight} 50%, ${base} 75%)`,
                backgroundSize: '800px 100%',
                animation: `${shimmer} 1.5s ease-in-out infinite`,
                mb,
            }}
        />
    );
};

interface ShimmerCardProps {
    variant?: 'contract' | 'template';
}

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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <ShimmerBlock width="55%" height={18} borderRadius={4} />
            <ShimmerBlock width="80px" height={24} borderRadius={12} />
        </Box>
        <ShimmerBlock width="85%" height={12} borderRadius={4} mb={1.5} />
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

const TemplateShimmer = () => (
    <Box
        sx={{
            bgcolor: 'background.paper',
            borderRadius: 2.5,
            p: 2,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
        }}
    >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
            <ShimmerBlock width={40} height={40} borderRadius={8} />
            <ShimmerBlock width="70px" height={24} borderRadius={12} />
        </Box>
        <ShimmerBlock width="70%" height={16} borderRadius={4} mb={0.75} />
        <ShimmerBlock width="90%" height={12} borderRadius={4} mb={0.5} />
        <ShimmerBlock width="60%" height={12} borderRadius={4} />
    </Box>
);

export default function ShimmerCard({ variant = 'contract' }: ShimmerCardProps) {
    return variant === 'template' ? <TemplateShimmer /> : <ContractShimmer />;
}

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

const ReviewApprovalShimmerCard = () => {
    const theme = useTheme();
    const { base, highlight } = theme.shimmer;
    const gradient = `linear-gradient(90deg, ${base} 25%, ${highlight} 50%, ${base} 75%)`;
    return (
        <Box
            sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2.5,
                bgcolor: 'background.paper',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
        >
            <Box
                sx={{
                    p: 1.5,
                    background: gradient,
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
            <Box sx={{ p: 2 }}>
                <ShimmerBlock width="70%" height={16} borderRadius={4} mb={1} />
                <ShimmerBlock width="50%" height={12} borderRadius={3} mb={1} />
                <ShimmerBlock width="90%" height={11} borderRadius={3} mb={0.5} />
                <ShimmerBlock width="65%" height={11} borderRadius={3} mb={2} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {[0, 1, 2].map((i) => (
                        <ShimmerBlock key={i} width={32} height={32} borderRadius={16} />
                    ))}
                </Box>
            </Box>
        </Box>
    );
};

export function ReviewApprovalShimmerGrid({ count = 6 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <ReviewApprovalShimmerCard key={`ra-shimmer-${i}`} />
            ))}
        </>
    );
}

const ConnectorLine = () => {
    const theme = useTheme();
    const { base, highlight } = theme.shimmer;
    return (
        <Box
            sx={{
                flex: 1,
                height: 4,
                background: `linear-gradient(90deg, ${base} 25%, ${highlight} 50%, ${base} 75%)`,
                backgroundSize: '800px 100%',
                animation: `${shimmer} 1.5s ease-in-out infinite`,
            }}
        />
    );
};

export function ContractDetailShimmer() {
    return (
        <Box>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    pb: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                    <ShimmerBlock width={36} height={36} borderRadius={18} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ShimmerBlock width={200} height={22} borderRadius={4} />
                        <ShimmerBlock width={64} height={24} borderRadius={6} />
                    </Box>
                </Box>
            </Box>

            <Box
                sx={{
                    mt: 1.5,
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'divider',
                    p: 2,
                    bgcolor: 'background.paper',
                }}
            >
                <ShimmerBlock width={160} height={16} borderRadius={4} mb={2} />
                <Box sx={{ display: 'flex', alignItems: 'center', px: 4, mb: 0.5 }}>
                    <ShimmerBlock width={28} height={28} borderRadius={14} />
                    <ConnectorLine />
                    <ShimmerBlock width={28} height={28} borderRadius={14} />
                    <ConnectorLine />
                    <ShimmerBlock width={28} height={28} borderRadius={14} />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 3.5, mb: 1 }}>
                    {[0, 1, 2].map((i) => (
                        <ShimmerBlock key={i} width={36} height={11} borderRadius={3} />
                    ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                    {[0, 1, 2].map((i) => (
                        <Box
                            key={i}
                            sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                px: 1.25,
                                py: 0.875,
                                borderRadius: 1.5,
                                border: '1px solid',
                                borderColor: 'divider',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <ShimmerBlock width={14} height={14} borderRadius={7} />
                                <ShimmerBlock width={100} height={12} borderRadius={3} />
                            </Box>
                            <ShimmerBlock width={52} height={11} borderRadius={3} />
                        </Box>
                    ))}
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 1.5,
                        py: 1,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        mb: 1.5,
                    }}
                >
                    <ShimmerBlock width={22} height={22} borderRadius={11} />
                    <ShimmerBlock width="55%" height={13} borderRadius={4} />
                </Box>
                <ShimmerBlock width={160} height={38} borderRadius={6} />
            </Box>

            <Box
                sx={{
                    mt: 1.5,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', lg: '1.5fr 1fr' },
                    gap: 2,
                }}
            >
                <Box
                    sx={{
                        bgcolor: 'background.paper',
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        p: 2.5,
                    }}
                >
                    <ShimmerBlock width={180} height={18} borderRadius={4} mb={2} />
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mb: 2 }}>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <Box key={i}>
                                <ShimmerBlock width="40%" height={10} borderRadius={3} mb={0.5} />
                                <ShimmerBlock width="70%" height={15} borderRadius={3} />
                            </Box>
                        ))}
                    </Box>
                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 2 }} />
                    <ShimmerBlock width="30%" height={10} borderRadius={3} mb={0.75} />
                    <ShimmerBlock width="95%" height={13} borderRadius={4} mb={0.5} />
                    <ShimmerBlock width="75%" height={13} borderRadius={4} mb={0.5} />
                    <ShimmerBlock width="50%" height={13} borderRadius={4} mb={2} />
                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 2 }} />
                    <ShimmerBlock width="35%" height={10} borderRadius={3} mb={1} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                        <ShimmerBlock width="45%" height={12} borderRadius={3} />
                        <ShimmerBlock width={80} height={12} borderRadius={3} />
                    </Box>
                    <ShimmerBlock width="100%" height={8} borderRadius={4} />
                </Box>

                <Box
                    sx={{
                        bgcolor: 'background.paper',
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        p: 2.5,
                    }}
                >
                    <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
                        <ShimmerBlock width={110} height={34} borderRadius={6} />
                        <ShimmerBlock width={90} height={34} borderRadius={6} />
                    </Box>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            p: 1.5,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            mb: 1.5,
                        }}
                    >
                        <ShimmerBlock width={40} height={40} borderRadius={8} />
                        <Box sx={{ flex: 1 }}>
                            <ShimmerBlock width="65%" height={14} borderRadius={4} mb={0.5} />
                            <ShimmerBlock width="45%" height={11} borderRadius={3} />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.75 }}>
                            <ShimmerBlock width={28} height={28} borderRadius={6} />
                            <ShimmerBlock width={28} height={28} borderRadius={6} />
                        </Box>
                    </Box>
                    {[0, 1, 2].map((i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1.75 }}>
                            <ShimmerBlock width={10} height={10} borderRadius={5} />
                            <Box sx={{ flex: 1 }}>
                                <ShimmerBlock width="65%" height={13} borderRadius={4} mb={0.5} />
                                <ShimmerBlock width="85%" height={11} borderRadius={3} />
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}