/**
 * BellePoule Modern - Mode Club (#1872) : QR d'identification d'un membre (même contenu
 * que sa carte, `BPC1:M:<code>`) à scanner depuis l'écran, et impression de sa seule carte.
 * Licensed under GPL-3.0
 */
import React, { useEffect, useState } from 'react';
import { IdCard, Printer } from 'lucide-react';
import type { ClubMember } from '../../../shared/types/club';
import { memberQrPayload } from '../../../shared/utils/clubQr';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface ClubMemberQrModalProps {
  member: ClubMember;
  /** Imprime (ou enregistre en PDF) la carte de ce seul membre */
  onPrint: (mode: 'print' | 'pdf') => Promise<void>;
  printing?: boolean;
  onClose: () => void;
}

export const ClubMemberQrModal: React.FC<ClubMemberQrModalProps> = ({
  member,
  onPrint,
  printing,
  onClose,
}) => {
  const { t } = useTranslation();
  const [qr, setQr] = useState<string | null>(null);
  const name = `${member.firstName} ${member.lastName}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QRCode = (await import('qrcode')).default;
      const data = await QRCode.toDataURL(memberQrPayload(member.cardCode), {
        errorCorrectionLevel: 'M',
        width: 280,
        margin: 1,
        color: { dark: '#000', light: '#fff' },
      });
      if (!cancelled) setQr(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [member.cardCode]);

  return (
    <Modal
      title={t('club.member_qr_title', { name })}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{t('actions.close')}</Button>
          <Button
            variant="ghost"
            icon={<IdCard size={15} aria-hidden="true" />}
            disabled={printing || !member.active}
            onClick={() => void onPrint('pdf')}
          >
            {t('club.card_pdf')}
          </Button>
          <Button
            variant="primary"
            icon={<Printer size={15} aria-hidden="true" />}
            loading={printing}
            disabled={!member.active}
            onClick={() => void onPrint('print')}
          >
            {t('club.print_card')}
          </Button>
        </>
      }
    >
      <div className="club-member-qr">
        {qr ? (
          <img src={qr} width={280} height={280} alt={t('club.member_qr_alt', { name })} />
        ) : null}
        <div className="club-mono">{member.cardCode}</div>
      </div>
    </Modal>
  );
};
