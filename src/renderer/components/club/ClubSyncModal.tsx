/**
 * BellePoule Modern - Mode Club : synchronisation d'un club vers un dossier externe
 * (Google Drive, Dropbox…) — activation, état, synchro immédiate, résolution de conflit.
 * Licensed under GPL-3.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, RefreshCw } from 'lucide-react';
import type { ClubSyncStatus } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../Toast';

interface ClubSyncModalProps {
  clubId: string;
  onChanged: () => void;
  onClose: () => void;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ClubSyncModal({ clubId, onChanged, onClose }: ClubSyncModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [status, setStatus] = useState<ClubSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const api = window.electronAPI?.club;
    if (!api) return;
    setStatus(await api.syncStatus(clubId));
  }, [clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Lance une action, affiche son erreur, recharge l'état et la vue du club */
  const run = async (action: () => Promise<ClubSyncStatus | null>, done?: string) => {
    setBusy(true);
    try {
      const next = await action();
      // null = sélecteur de dossier annulé : rien n'a changé
      if (!next) return;
      setStatus(next);
      if (done) showToast(done, 'success');
      onChanged();
    } catch (e) {
      showToast(errText(e), 'error');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const api = window.electronAPI?.club;
  const enabled = status !== null && status.state !== 'off';

  const stateLine = (): { text: string; tone: 'ok' | 'warn' | 'off' } => {
    if (!status || status.state === 'off') return { text: t('clubs.sync_state_off'), tone: 'off' };
    if (status.state === 'conflict') return { text: t('clubs.sync_state_conflict'), tone: 'warn' };
    if (status.state === 'error')
      return { text: t('clubs.sync_state_error', { message: status.error ?? '' }), tone: 'warn' };
    return { text: t('clubs.sync_state_synced'), tone: 'ok' };
  };
  const line = stateLine();

  return (
    <Modal
      title={t('clubs.sync_title')}
      onClose={onClose}
      size="md"
      footer={
        <>
          {enabled && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => api!.syncDisable(clubId))}
            >
              {t('clubs.sync_disable')}
            </Button>
          )}
          {enabled && status?.state !== 'conflict' && (
            <Button
              icon={<RefreshCw size={15} aria-hidden="true" />}
              disabled={busy}
              onClick={() => void run(() => api!.syncNow(clubId))}
            >
              {t('clubs.sync_now')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('actions.close')}
          </Button>
        </>
      }
    >
      <p className="club-sync-help">{t('clubs.sync_help')}</p>
      <p className="club-sync-warning">
        <AlertTriangle size={14} aria-hidden="true" /> {t('clubs.sync_warning')}
      </p>

      {enabled && status?.dir && (
        <dl className="club-sync-details">
          <dt>{t('clubs.sync_folder')}</dt>
          <dd>{status.dir}</dd>
          <dt>{t('clubs.sync_file')}</dt>
          <dd>{status.fileName}</dd>
          {status.lastSync && (
            <>
              <dt>{t('clubs.sync_last_label')}</dt>
              <dd>{new Date(status.lastSync).toLocaleString()}</dd>
            </>
          )}
        </dl>
      )}

      <p className={`club-sync-state club-sync-state--${line.tone}`} role="status">
        {line.tone === 'ok' ? (
          <CheckCircle2 size={15} aria-hidden="true" />
        ) : line.tone === 'warn' ? (
          <AlertTriangle size={15} aria-hidden="true" />
        ) : null}{' '}
        {line.text}
      </p>

      {status?.state === 'conflict' && (
        <div className="club-sync-conflict">
          <p>{t('clubs.sync_conflict_help')}</p>
          <div className="club-sync-conflict-actions">
            <Button
              disabled={busy}
              onClick={() =>
                void run(() => api!.syncResolve(clubId, 'file'), t('clubs.sync_resolved'))
              }
            >
              {t('clubs.sync_keep_file')}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(() => api!.syncResolve(clubId, 'app'), t('clubs.sync_resolved'))
              }
            >
              {t('clubs.sync_keep_app')}
            </Button>
          </div>
        </div>
      )}

      {!enabled && (
        <Button
          icon={<FolderOpen size={15} aria-hidden="true" />}
          disabled={busy}
          onClick={() => void run(() => api!.syncEnable(clubId), t('clubs.sync_enabled'))}
        >
          {t('clubs.sync_enable')}
        </Button>
      )}
    </Modal>
  );
}
