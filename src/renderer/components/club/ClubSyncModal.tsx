/**
 * BellePoule Modern - Mode Club : synchronisation d'un club vers un dossier externe
 * (Google Drive, Dropbox…) — activation, état, synchro immédiate, résolution de conflit,
 * et sauvegardes locales (Backup) pour revenir en arrière.
 * Licensed under GPL-3.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, RefreshCw, Save } from 'lucide-react';
import type { ClubBackupEntry, ClubSyncStatus } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { useConfirm } from '../ConfirmDialog';
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
  const { confirm } = useConfirm();
  const [status, setStatus] = useState<ClubSyncStatus | null>(null);
  const [backups, setBackups] = useState<ClubBackupEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const api = window.electronAPI?.club;
    if (!api) return;
    try {
      const [nextStatus, nextBackups] = await Promise.all([
        api.syncStatus(clubId),
        api.backupList(clubId),
      ]);
      setStatus(nextStatus);
      setBackups(nextBackups);
    } catch (e) {
      showToast(errText(e), 'error');
    }
  }, [clubId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Lance une action de synchro, affiche son erreur, recharge l'état et la vue du club */
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

  /** Sauvegarde locale : création (rotation) ou restauration */
  const runBackup = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      showToast(done, 'success');
      await load();
      onChanged();
    } catch (e) {
      showToast(errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (id: string) => {
    const ok = await confirm({
      message: t('clubs.backup_restore_confirm'),
      confirmLabel: t('clubs.backup_restore'),
    });
    if (!ok) return;
    await runBackup(() => api!.backupRestore(clubId, id), t('clubs.backup_restored'));
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
      size="lg"
      footer={
        enabled ? (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => api!.syncDisable(clubId))}
            >
              {t('clubs.sync_disable')}
            </Button>
            {status?.state !== 'conflict' && (
              <Button
                icon={<RefreshCw size={15} aria-hidden="true" />}
                disabled={busy}
                onClick={() => void run(() => api!.syncNow(clubId))}
              >
                {t('clubs.sync_now')}
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <p className="club-sync-help">{t('clubs.sync_help')}</p>
      <p className="club-sync-warning">
        <AlertTriangle size={14} aria-hidden="true" /> {t('clubs.sync_warning')}
      </p>

      <div className="club-sync-grid">
        <section className="club-card club-sync-card" aria-labelledby="club-sync-folder-title">
          <h3 id="club-sync-folder-title" className="club-card-title">
            {t('clubs.sync_folder')}
          </h3>
          <p className="club-sync-value">{enabled && status?.dir ? status.dir : '—'}</p>
        </section>

        <section className="club-card club-sync-card" aria-labelledby="club-sync-file-title">
          <h3 id="club-sync-file-title" className="club-card-title">
            {t('clubs.sync_file')}
          </h3>
          <p className="club-sync-value">{enabled && status?.fileName ? status.fileName : '—'}</p>
        </section>

        <section className="club-card club-sync-card" aria-labelledby="club-sync-state-title">
          <h3 id="club-sync-state-title" className="club-card-title">
            {t('clubs.sync_card_state')}
          </h3>
          {enabled && status?.lastSync && (
            <p className="club-sync-value">
              {t('clubs.sync_last_label')} : {new Date(status.lastSync).toLocaleString()}
            </p>
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
        </section>

        <section className="club-card club-sync-card" aria-labelledby="club-sync-backup-title">
          <h3 id="club-sync-backup-title" className="club-card-title">
            {t('clubs.backup_card')}
          </h3>
          <p className="club-sync-help">{t('clubs.backup_help')}</p>
          <Button
            icon={<Save size={15} aria-hidden="true" />}
            disabled={busy}
            onClick={() =>
              void runBackup(() => api!.backupCreate(clubId), t('clubs.backup_created'))
            }
          >
            {t('clubs.backup_create')}
          </Button>
          {backups.length === 0 ? (
            <p className="club-sync-value">{t('clubs.backup_empty')}</p>
          ) : (
            <ul className="club-backup-list">
              {backups.map(b => (
                <li key={b.id} className="club-backup-item">
                  <span>{new Date(b.createdAt).toLocaleString()}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void restoreBackup(b.id)}
                  >
                    {t('clubs.backup_restore')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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
