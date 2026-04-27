'use client';

import { Box, Typography, Tooltip, IconButton, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Team } from '@/types/team';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

interface TeamCardProps {
    team: Team;
    contractCount: number;
    onClick: (teamId: string) => void;
    onRename: (team: Team) => void;
}

export default function TeamCard({ team, contractCount, onClick, onRename }: TeamCardProps) {
    const theme = useTheme();
    const primaryColor = theme.palette.primary.main;
    const isDark = theme.palette.mode === 'dark';
    const tTooltips = useTranslations('tooltips');
    const chipColor = isDark ? '#e8ce7aff' : primaryColor;
    const iconBtnBorder = alpha(theme.palette.text.secondary, 0.35);
    return (
        <Box
            onClick={() => onClick(team._id)}
            sx={{
                bgcolor: 'background.paper',
                borderRadius: 3,
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                    boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                    transform: 'translateY(-4px)',
                    borderColor: primaryColor,
                    '& .team-action-buttons': { opacity: 1 },
                    '& .team-icon-box': { transform: 'scale(1.1)' },
                },
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: theme.sidebar.cardHoverGradient,
                    opacity: 0,
                    transition: 'opacity 0.35s ease',
                },
                '&:hover::before': { opacity: 1 },
            }}
        >
            {/* Folder icon + title row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                <Box
                    className="team-icon-box"
                    sx={{
                        width: 32,
                        height: 32,
                        borderRadius: 1.5,
                        bgcolor: alpha(primaryColor, isDark ? 0.15 : 0.12),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.3s',
                    }}
                >
                    <FolderOpenOutlinedIcon sx={{ fontSize: 17, color: primaryColor }} />
                </Box>

                <Tooltip title={team.name} arrow placement="top">
                    <Typography
                        variant="subtitle2"
                        sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                        {team.name}
                    </Typography>
                </Tooltip>
            </Box>

            {/* Contract count */}
            <Typography variant="caption" sx={{ color: contractCount > 0 ? chipColor : 'text.disabled', fontWeight: 600, fontSize: '0.72rem', display: 'block' }}>
                {contractCount} {contractCount === 1 ? 'contract' : 'contracts'}
            </Typography>

            {/* Created date */}
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                Created {dayjs(team.createdAt).format('DD/MM/YYYY')}
            </Typography>

            {/* Hover action buttons */}
            <Box
                className="team-action-buttons"
                onClick={e => e.stopPropagation()}
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    gap: 1,
                    p: '4px 8px',
                    bgcolor: theme.card.actionOverlay,
                    borderRadius: '0 0 12px 12px',
                    opacity: { xs: 1, md: 0 },
                    transition: 'opacity 0.2s ease-in-out',
                }}
            >
                {[
                    {
                        title: tTooltips('openTeam'),
                        icon: <VisibilityOutlinedIcon sx={{ fontSize: '0.8rem' }} />,
                        onClick: () => onClick(team._id),
                    },
                    {
                        title: tTooltips('renameTeam'),
                        icon: <EditOutlinedIcon sx={{ fontSize: '0.8rem' }} />,
                        onClick: () => onRename(team),
                    },
                ].map((action, idx) => (
                    <Tooltip key={idx} title={action.title} arrow>
                        <IconButton
                            size="small"
                            onClick={action.onClick}
                            sx={{
                                bgcolor: 'transparent',
                                border: '1px solid',
                                borderColor: iconBtnBorder,
                                borderRadius: 1.5,
                                color: 'text.primary',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    bgcolor: 'primary.main',
                                    borderColor: 'primary.main',
                                    color: 'white',
                                    transform: 'translateY(-2px)',
                                    boxShadow: `0 4px 8px ${alpha(primaryColor, 0.2)}`,
                                },
                            }}
                        >
                            {action.icon}
                        </IconButton>
                    </Tooltip>
                ))}
            </Box>
        </Box>
    );
}
