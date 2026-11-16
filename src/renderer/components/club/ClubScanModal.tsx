/**
 * BellePoule Modern - Mode Club (#1872) : lancer un combat en scannant le QR de la piste
 * puis les cartes des deux tireurs. Les tireurs scannés sont pointés présents.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { ClubMember, ClubSession } from '../../../shared/types/club';
import { parseClubQr } from '../../../shared/utils/clubQr';
import {
  EMPTY_SCAN,
  applyScan,
  isRepeatScan,
  type ScanState,
} from '../../../shared/utils/clubScanFlow';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { QrScanner } from './QrScanner';

interface ClubScanModalProps {
  session: ClubSession;
  onClose: () => void;
  /** Combat créé et lancé : la vue l'envoie à la tablette (saisie distante) et recharge */
  onLaunched: (boutId: string) => void;
}

const fullName = (m: ClubMember | undefined) => (m ? `${m.lastName} ${m.firstName}` : '');

export const ClubScanModal: React.FC<ClubScanModalProps> = ({ session, onClose, onLaunched }) => {
  const { t } = useTranslation();
  const api = window.electronAPI?.club;
  const [scan, setScan] = useState<ScanState>(EMPTY_SCAN);
  const [members, setMembers] = useState<Record<string, ClubMember>>({});
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const last = useRef<{ text: string; at: number } | null>(null);
  const busy = useRef(false);
  const scanRef = useRef(scan);
  useEffect(() => {
    scanRef.current = scan;
  }, [scan]);

  const launch = useCallback(
    async (state: ScanState) => {
      if (!api || state.strip === null) return;
      const [a, b] = state.memberIds;
      await api.setAttendance(session.id, a, true);
      await api.setAttendance(session.id, b, true);
      const bout = await api.createBout({
        sessionId: session.id,
        memberAId: a,
        memberBId: b,
        strip: state.strip,
        entryMode: 'master',
      });
      await api.startBout(bout.id);
      setMessage({ text: t('clubSession.scan_launched', { strip: state.strip }), ok: true });
      scanRef.current = EMPTY_SCAN;
      setScan(EMPTY_SCAN);
      onLaunched(bout.id);
    },
    [api, session.id, t, onLaunched]
  );

  const onDecode = useCallback(
    async (text: string) => {
      const now = Date.now();
      if (!api || busy.current || isRepeatScan(last.current, text, now)) return;
      last.current = { text, at: now };
      const data = parseClubQr(text);
      if (!data) {
        setMessage({ text: t('clubSession.scan_unknown'), ok: false });
        return;
      }
      busy.current = true;
      try {
        let input;
        if (data.kind === 'arena') {
          input = { kind: 'arena' as const, number: data.number };
        } else {
          const m = await api.findMemberByCardCode(data.code, session.clubId);
          if (!m) {
            setMessage({ text: t('clubSession.scan_member_unknown'), ok: false });
            return;
          }
          setMembers(prev => ({ ...prev, [m.id]: m }));
          input = { kind: 'member' as const, id: m.id };
        }
        const r = applyScan(scanRef.current, input, session.stripCount);
        if (r.error) {
          setMessage({ text: t(`clubSession.scan_${r.error}`), ok: false });
          return;
        }
        scanRef.current = r.state;
        setScan(r.state);
        setMessage(null);
        if (r.complete) await launch(r.state);
      } catch (e) {
        setMessage({ text: e instanceof Error ? e.message : String(e), ok: false });
      } finally {
        busy.current = false;
      }
    },
    [api, launch, session.stripCount, t]
  );

  const [a, b] = scan.memberIds;
  const steps = [
    {
      label: t('clubSession.scan_step_strip'),
      value: scan.strip ? t('clubSession.strip_n', { n: scan.strip }) : '',
    },
    { label: t('clubSession.scan_step_fencer', { n: 1 }), value: fullName(members[a]) },
    { label: t('clubSession.scan_step_fencer', { n: 2 }), value: fullName(members[b]) },
  ];

  return (
    <Modal
      title={t('clubSession.scan_title')}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            icon={<RotateCcw size={15} aria-hidden="true" />}
            onClick={() => {
              setScan(EMPTY_SCAN);
              setMessage(null);
            }}
          >
            {t('clubSession.scan_reset')}
          </Button>
          <Button onClick={onClose}>{t('actions.close')}</Button>
        </>
      }
    >
      <p className="club-muted">{t('clubSession.scan_help')}</p>
      <QrScanner onDecode={text => void onDecode(text)} />
      <ol className="club-scan-steps">
        {steps.map(s => (
          <li key={s.label} className={s.value ? 'is-done' : undefined}>
            {s.value ? <Check size={14} aria-hidden="true" /> : null}
            <span>{s.label}</span>
            <strong>{s.value || '—'}</strong>
          </li>
        ))}
      </ol>
      {message && (
        <p className={message.ok ? 'club-scan-ok' : 'club-scan-error'} role="status">
          {message.text}
        </p>
      )}
    </Modal>
  );
};
