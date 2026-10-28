/**
 * BellePoule Modern - Boîte d'impression intégrée (#1214)
 * À gauche l'aperçu réel des pages (PDF exact, rendu pdf.js), à droite les réglages.
 * Imprimer = envoi direct à l'imprimante choisie ; secours : boîte du système, enregistrement PDF.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../common/Modal';
import { useTranslation } from '../../hooks/useTranslation';
import type { PrintDialogSettings } from '../../../shared/types/preload';
import { loadPdfJs, type PdfDocument, type PdfLoadingTask } from './pdfjsLoader';
import { isValidPageRanges, loadSettings, pageRangesBeyond, saveSettings } from './printSettings';

export interface PrintDialogResult {
  success: boolean;
  /** Fermée sans imprimer : ce n'est pas une erreur */
  canceled?: boolean;
  error?: string;
}

interface PrintDialogProps {
  html: string;
  onDone: (result: PrintDialogResult) => void;
}

type Printer = { name: string; displayName: string; isDefault: boolean };

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];
const PREVIEW_DELAY_MS = 350;

/** Titre du document (balise <title> du HTML d'impression), proposé comme nom de fichier PDF */
const documentTitle = (html: string): string | undefined =>
  /<title>([^<]{1,120})<\/title>/i.exec(html)?.[1]?.trim();

/** Libère le document pdf.js ; une erreur de libération ne doit jamais faire planter l'interface */
const destroyTask = (task: PdfLoadingTask | null) => {
  try {
    void Promise.resolve(task?.destroy()).catch(() => {});
  } catch {
    /* ignoré */
  }
};

const PrintDialog: React.FC<PrintDialogProps> = ({ html, onDone }) => {
  const { t } = useTranslation();
  const api = window.electronAPI.printDialog;
  const [settings, setSettings] = useState<PrintDialogSettings>(loadSettings);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [previewing, setPreviewing] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pagesRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PdfDocument | null>(null);
  const taskRef = useRef<PdfLoadingTask | null>(null);

  const update = <K extends keyof PrintDialogSettings>(key: K, value: PrintDialogSettings[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  // Imprimantes installées : la dernière utilisée si elle existe encore, sinon celle par défaut
  useEffect(() => {
    let alive = true;
    api
      .getPrinters()
      .then(list => {
        if (!alive) return;
        setPrinters(list);
        setSettings(prev =>
          list.some(p => p.name === prev.printer)
            ? prev
            : { ...prev, printer: list.find(p => p.isDefault)?.name ?? list[0]?.name ?? '' }
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api]);

  // Aperçu : PDF rendu par le main (mêmes réglages que l'impression), dessiné par pdf.js
  const renderPages = useCallback(
    async (doc: PdfDocument, zoomPct: number, isStale: () => boolean) => {
      const host = pagesRef.current;
      if (!host) return;
      const width = Math.max(host.clientWidth - 32, 200);
      const ratio = window.devicePixelRatio || 1;
      host.replaceChildren();
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (isStale()) return;
        const base = page.getViewport({ scale: 1 });
        const scale = (width / base.width) * (zoomPct / 100);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.className = 'print-dialog__page';
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        host.appendChild(canvas);
        await page.render({
          canvasContext: ctx,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        }).promise;
      }
    },
    []
  );

  const renderKey = JSON.stringify({
    ...settings,
    copies: 0,
    printer: '',
    pages: '',
    color: true,
    duplex: '',
  });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    let stale = false;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      setPreviewError('');
      try {
        const [lib, res] = await Promise.all([loadPdfJs(), api.render(html, settings)]);
        if (stale) return;
        if (!res.success || !res.data) throw new Error(res.error || 'render_failed');
        const task = lib.getDocument({ data: res.data, isEvalSupported: false });
        const doc = await task.promise;
        if (stale) {
          destroyTask(task);
          return;
        }
        const previous = taskRef.current;
        docRef.current = doc;
        taskRef.current = task;
        setPageCount(doc.numPages);
        await renderPages(doc, zoomRef.current, () => stale);
        destroyTask(previous);
      } catch {
        if (!stale) setPreviewError(t('print.preview_failed'));
      } finally {
        if (!stale) setPreviewing(false);
      }
    }, PREVIEW_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // Le rendu ne dépend que des réglages de mise en page (pas de l'imprimante, des copies…)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, renderKey, api, renderPages, t]);

  // Zoom : redessine le PDF déjà chargé
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    let stale = false;
    void renderPages(doc, zoom, () => stale).catch(() => {});
    return () => {
      stale = true;
    };
  }, [zoom, renderPages]);

  useEffect(
    () => () => {
      destroyTask(taskRef.current);
      taskRef.current = null;
      docRef.current = null;
    },
    []
  );

  const pagesValid = isValidPageRanges(settings.pages);
  const beyond = pageRangesBeyond(settings.pages, pageCount);
  // Aperçu en échec : l'impression et l'enregistrement restent possibles (rendu côté main)
  const ready = pageCount > 0 || !!previewError;
  const canPrint =
    !busy && pagesValid && !beyond && ready && (printers.length === 0 || !!settings.printer);

  const run = async (action: () => Promise<PrintDialogResult | undefined>) => {
    setBusy(true);
    setError('');
    try {
      const res = await action();
      if (res?.canceled) return;
      if (res && !res.success) {
        setError(res.error ? `${t('print.failed')} (${res.error})` : t('print.failed'));
        return;
      }
      saveSettings(settings);
      onDone({ success: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('print.failed'));
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => run(() => api.execute(html, settings));
  const handleSavePdf = () => run(() => api.savePdf(html, settings, documentTitle(html)));
  // Boîte du système : elle gère elle-même annulation et réglages
  const handleSystem = () => run(() => api.systemDialog(html));
  const cancel = () => onDone({ success: true, canceled: true });

  const select = <K extends keyof PrintDialogSettings>(
    key: K,
    label: string,
    options: { value: PrintDialogSettings[K]; label: string }[],
    disabled = false
  ) => (
    <label className="print-dialog__field">
      <span>{label}</span>
      <select
        value={String(settings[key])}
        disabled={disabled}
        onChange={e => {
          const raw = e.target.value;
          const match = options.find(o => String(o.value) === raw);
          if (match) update(key, match.value);
        }}
      >
        {options.map(o => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Modal
      title={t('print.title')}
      onClose={cancel}
      size="xl"
      scroll
      elevated
      closeOnOverlay={false}
      bodyClassName="print-dialog__body"
      footer={
        <>
          <button className="btn btn-secondary" onClick={handleSystem} disabled={busy}>
            {t('print.system_dialog')}
          </button>
          <button className="btn btn-secondary" onClick={handleSavePdf} disabled={busy || !ready}>
            {t('print.save_pdf')}
          </button>
          <button className="btn btn-secondary" onClick={cancel} disabled={busy}>
            {t('actions.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handlePrint} disabled={!canPrint}>
            {t('print.print')}
          </button>
        </>
      }
    >
      <div className="print-dialog">
        <section className="print-dialog__preview" aria-label={t('print.preview')}>
          <div className="print-dialog__toolbar">
            <span aria-live="polite">
              {previewing
                ? t('print.loading')
                : t('print.pages_count', { count: String(pageCount) })}
            </span>
            <span className="print-dialog__zoom">
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={t('print.zoom_out')}
                disabled={zoom === ZOOM_STEPS[0]}
                onClick={() => setZoom(z => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(z) - 1)])}
              >
                −
              </button>
              <span>{zoom}%</span>
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={t('print.zoom_in')}
                disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                onClick={() =>
                  setZoom(
                    z => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(z) + 1)]
                  )
                }
              >
                +
              </button>
            </span>
          </div>
          <div className="print-dialog__pages" ref={pagesRef} />
          {previewError && (
            <p className="print-dialog__error" role="alert">
              {previewError}
            </p>
          )}
        </section>

        <section className="print-dialog__settings" aria-label={t('print.settings')}>
          <label className="print-dialog__field">
            <span>{t('print.printer')}</span>
            <select
              value={settings.printer}
              disabled={printers.length === 0}
              onChange={e => update('printer', e.target.value)}
            >
              {printers.length === 0 && <option value="">{t('print.no_printer')}</option>}
              {printers.map(p => (
                <option key={p.name} value={p.name}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="print-dialog__field">
            <span>{t('print.copies')}</span>
            <input
              type="number"
              min={1}
              max={99}
              value={settings.copies}
              onChange={e =>
                update('copies', Math.min(99, Math.max(1, Number(e.target.value) || 1)))
              }
            />
          </label>
          <label className="print-dialog__field">
            <span>{t('print.pages')}</span>
            <input
              type="text"
              value={settings.pages}
              placeholder={t('print.pages_placeholder')}
              aria-invalid={!pagesValid || beyond}
              onChange={e => update('pages', e.target.value)}
            />
            {(!pagesValid || beyond) && (
              <small className="print-dialog__error">
                {pagesValid
                  ? t('print.pages_beyond', { count: String(pageCount) })
                  : t('print.pages_invalid')}
              </small>
            )}
          </label>
          {select('orientation', t('print.orientation'), [
            { value: 'auto', label: t('print.auto') },
            { value: 'portrait', label: t('print.portrait') },
            { value: 'landscape', label: t('print.landscape') },
          ])}
          {select('paperSize', t('print.paper'), [
            { value: 'auto', label: t('print.auto') },
            { value: 'A4', label: 'A4' },
            { value: 'A3', label: 'A3' },
            { value: 'A5', label: 'A5' },
            { value: 'Letter', label: 'Letter' },
            { value: 'Legal', label: 'Legal' },
          ])}
          {select('color', t('print.color'), [
            { value: true, label: t('print.color_color') },
            { value: false, label: t('print.color_bw') },
          ])}
          {select('duplex', t('print.duplex'), [
            { value: 'simplex', label: t('print.duplex_off') },
            { value: 'longEdge', label: t('print.duplex_long') },
            { value: 'shortEdge', label: t('print.duplex_short') },
          ])}
          {select('margins', t('print.margins'), [
            { value: 'default', label: t('print.margins_default') },
            { value: 'none', label: t('print.margins_none') },
            { value: 'minimum', label: t('print.margins_minimum') },
          ])}
          <label className="print-dialog__field">
            <span>{t('print.scale')}</span>
            <input
              type="number"
              min={10}
              max={200}
              step={5}
              value={settings.scale}
              onChange={e =>
                update('scale', Math.min(200, Math.max(10, Number(e.target.value) || 100)))
              }
            />
          </label>
          <p className="print-dialog__hint">{t('print.driver_hint')}</p>
          {error && (
            <p className="print-dialog__error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
};

export default PrintDialog;
