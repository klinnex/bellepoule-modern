/**
 * BellePoule Modern - Card Modal Component
 * Modal for assigning penalty cards in FFE Sabre Laser
 * Licensed under GPL-3.0
 */

import React, { useState, useMemo } from 'react';
import { CardReason, Card, Fencer } from '../../shared/types';
import { CardType } from '../../features/penalties/types/penalty.types';
import { determineCardType, createCard, getReasonsByGroup } from '../../shared/utils/cardSystem';
import { useTranslation } from '../hooks/useTranslation';

interface CardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: CardReason, card: Card) => void;
  fencer: Fencer;
  previousCards: Card[];
  opponentName: string;
}

const CardModal_: React.FC<CardModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  fencer,
  previousCards,
  opponentName,
}) => {
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState<CardReason | null>(null);

  const reasonsByGroup = useMemo(() => getReasonsByGroup(), []);

  const preview = useMemo(() => {
    if (!selectedReason) return null;
    return determineCardType(selectedReason, previousCards);
  }, [selectedReason, previousCards]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedReason && preview) {
      const card = createCard('', fencer.id, selectedReason, previousCards);
      onConfirm(selectedReason, card);
      setSelectedReason(null);
      onClose();
    }
  };

  const getCardBgColor = (cardType: CardType | undefined) => {
    if (!cardType) return 'bg-gray-100';
    switch (cardType) {
      case CardType.WHITE:
        return 'bg-white border-gray-400';
      case CardType.YELLOW:
        return 'bg-yellow-100 border-yellow-400';
      case CardType.RED:
        return 'bg-red-100 border-red-400';
      case CardType.BLACK:
        return 'bg-black text-white';
      default:
        return 'bg-gray-100';
    }
  };

  const getButtonColor = (cardType: CardType | undefined) => {
    if (!cardType) return 'bg-gray-300';
    switch (cardType) {
      case CardType.WHITE:
        return 'bg-gray-400 hover:bg-gray-500';
      case CardType.YELLOW:
        return 'bg-yellow-500 hover:bg-yellow-600';
      case CardType.RED:
        return 'bg-red-500 hover:bg-red-600';
      case CardType.BLACK:
        return 'bg-black hover:bg-gray-800';
      default:
        return 'bg-gray-300';
    }
  };

  const getCardLabel = (cardType: string) => {
    switch (cardType) {
      case CardType.WHITE:
        return t('cardModal.card_white');
      case CardType.YELLOW:
        return t('cardModal.card_yellow');
      case CardType.RED:
        return t('cardModal.card_red');
      case CardType.BLACK:
        return t('cardModal.card_black');
      default:
        return cardType;
    }
  };

  const getCardAbbr = (cardType: string) => {
    switch (cardType) {
      case CardType.WHITE:
        return t('cardModal.abbr_white');
      case CardType.YELLOW:
        return t('cardModal.abbr_yellow');
      case CardType.RED:
        return t('cardModal.abbr_red');
      case CardType.BLACK:
        return t('cardModal.abbr_black');
      default:
        return cardType;
    }
  };

  const fencerName = `${fencer.lastName} ${fencer.firstName}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{t('cardModal.title', { name: fencerName })}</h2>

        {previousCards.length > 0 && (
          <div className="mb-4 p-3 bg-gray-100 rounded">
            <p className="text-sm font-medium">{t('cardModal.previous_cards')}</p>
            <div className="flex gap-2 mt-1">
              {previousCards.map(card => (
                <span
                  key={card.id}
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    card.type === CardType.WHITE
                      ? 'bg-white border border-gray-400 text-black'
                      : card.type === CardType.YELLOW
                        ? 'bg-yellow-400 text-black'
                        : card.type === CardType.RED
                          ? 'bg-red-500 text-white'
                          : 'bg-black text-white'
                  }`}
                >
                  {getCardAbbr(card.type)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {Object.entries(reasonsByGroup).map(([group, reasons]) => (
            <div key={group}>
              <h3 className="font-semibold text-sm text-gray-600 mb-2">
                {t(`cardGroups.${group}`)}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {reasons.map(reason => (
                  <button
                    key={reason}
                    onClick={() => setSelectedReason(reason)}
                    className={`p-2 text-left rounded border text-sm ${
                      selectedReason === reason
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {t(`cardReasons.${reason}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {preview && (
          <div className={`mt-4 p-4 rounded-lg border-2 ${getCardBgColor(preview.type)}`}>
            <p className="font-bold text-lg">{getCardLabel(preview.type)}</p>
            {preview.points > 0 && (
              <p className="text-sm mt-1">
                {t('cardModal.points_for', { points: preview.points, name: opponentName })}
              </p>
            )}
            {preview.shouldExclude && (
              <p className="text-sm mt-1 font-bold">{t('cardModal.exclusion')}</p>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border rounded hover:bg-gray-50">
            {t('actions.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedReason}
            className={`flex-1 px-4 py-2 rounded text-white ${getButtonColor(
              preview?.type
            )} disabled:opacity-50`}
          >
            {t('actions.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const CardModal = React.memo(CardModal_);
export default CardModal;
