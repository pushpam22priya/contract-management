import ContractCard from './ContractCard';
import { Contract } from '@/types/contract';

/**
 * DraftCard - A wrapper around ContractCard with variant="draft"
 *
 * This component maintains backward compatibility while using the unified ContractCard.
 * It's equivalent to using <ContractCard variant="draft" ... />
 */

interface DraftCardProps {
    contract: Contract;
    onView?: (id: string) => void;
    onShare?: (id: string) => void;
}

const DraftCard = ({ contract, onView, onShare }: DraftCardProps) => {
    return (
        <ContractCard
            contract={contract}
            onView={onView}
            onShare={onShare}
            variant="draft"
        />
    );
};

export default DraftCard;