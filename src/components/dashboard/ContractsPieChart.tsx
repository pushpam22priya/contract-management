'use client';

import { Box, Paper, Typography } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface ContractsPieChartProps {
    stats: {
        draftCount: number;
        underReviewCount: number;
        approvedCount: number;
        activeCount: number;
        expiringCount: number;
        expiredCount: number;
    };
}

export default function ContractsPieChart({ stats }: ContractsPieChartProps) {
    // Prepare data for pie chart (excluding total count)
    const chartData = [
        {
            name: 'Draft',
            value: stats.draftCount,
            color: '#8b5cf6',
        },
        {
            name: 'Under Review',
            value: stats.underReviewCount,
            color: '#3b82f6',
        },
        {
            name: 'Approved',
            value: stats.approvedCount,
            color: '#14b8a6',
        },
        {
            name: 'Active',
            value: stats.activeCount,
            color: '#10b981',
        },
        {
            name: 'Expiring',
            value: stats.expiringCount,
            color: '#f59e0b',
        },
        {
            name: 'Expired',
            value: stats.expiredCount,
            color: '#ef4444',
        },
    ].filter(item => item.value > 0); // Only show categories with values

    // Custom label for the pie chart
    const renderCustomLabel = ({
        cx,
        cy,
        midAngle,
        innerRadius,
        outerRadius,
        percent,
    }: any) => {
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
        const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));

        if (percent < 0.05) return null; // Don't show label if less than 5%

        return (
            <text
                x={x}
                y={y}
                fill="white"
                textAnchor={x > cx ? 'start' : 'end'}
                dominantBaseline="central"
                style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}
            >
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        );
    };

    // Custom tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <Paper
                    elevation={3}
                    sx={{
                        p: 1.5,
                        bgcolor: 'white',
                        border: '1px solid',
                        borderColor: 'divider',
                    }}
                >
                    <Typography variant="body2" fontWeight={600} color="text.primary">
                        {payload[0].name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Count: {payload[0].value}
                    </Typography>
                </Paper>
            );
        }
        return null;
    };

    return (
        <Paper
            elevation={0}
            sx={{
                p: 2,
                height: '100%',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.08)',
                bgcolor: 'white',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Typography fontSize={16} fontWeight={600} color="text.primary" mb={1}>
                Contract Status Distribution
            </Typography>

            {chartData.length === 0 ? (
                <Box
                    sx={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Typography color="text.secondary" variant="body2">No data</Typography>
                </Box>
            ) : (
                <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={renderCustomLabel}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            animationBegin={0}
                            animationDuration={800}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
                        {/* <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                            iconSize={8}
                            formatter={(value, entry: any) => (
                                <span style={{ color: '#666', fontSize: '12px' }}>
                                    {value} ({entry.payload.value})
                                </span>
                            )}
                        /> */}
                    </PieChart>
                </ResponsiveContainer>
            )}
        </Paper>
    );
}
