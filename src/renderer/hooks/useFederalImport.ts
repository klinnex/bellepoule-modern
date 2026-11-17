/**
 * BellePoule Modern - Lecture des fichiers de l'extranet dans « Nouvelle compétition » (#1938)
 * Licensed under GPL-3.0
 *
 * Choix (dialogue natif) ou dépôt du .zip de l'extranet, d'un .xml, d'un .fff ou d'un .txt
 * d'arbitres ; le main ouvre et décode, l'analyse (fusion, écarts) est partagée.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  buildFederalImport,
  resolveFederalFencers,
  resolveFederalTeams,
  type FederalImport,
  type FederalNotice,
  type FencerSource,
} from '../../shared/utils/fileParser/federalImport';
import type { FederalTextFile } from '../../shared/types/preload';
import type { Fencer } from '../../shared/types';
import type { ImportedReferee, ImportedTeam } from '../../shared/utils/fileParser/common';
import { logger, LogCategory } from '../../shared/services/logger';

/** Données à créer avec la compétition */
export interface FederalCreationPayload {
  fencers: Partial<Fencer>[];
  teams: ImportedTeam[];
  referees: ImportedReferee[];
}

/** Titre évoquant une épreuve mixte (« Homme Dame », « Mixte ») alors que le sexe ne l'est pas */
function mixedTitleNotice(imp: FederalImport): FederalNotice | null {
  const h = imp.header;
  if (!h?.fields.title || !h.federal.gender || h.federal.gender.toUpperCase() === 'X') return null;
  const title = h.fields.title.toLowerCase();
  const mixed =
    /\bmixte\b/.test(title) ||
    (/\bhommes?\b/.test(title) && /\bdames?\b/.test(title)) ||
    (/\bmasculin/.test(title) && /\bf[ée]minin/.test(title));
  return mixed ? { code: 'mixedTitle', value: h.federal.gender } : null;
}

export function useFederalImport() {
  const [result, setResult] = useState<FederalImport | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<FencerSource>('xml');

  const load = useCallback((files: FederalTextFile[], fileNames: string[]) => {
    const imp = buildFederalImport(files);
    const extra = mixedTitleNotice(imp);
    setResult(extra ? { ...imp, notices: [...imp.notices, extra] } : imp);
    setNames(fileNames);
    setSource('xml');
    setError(null);
  }, []);

  const run = useCallback(async (task: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      logger.error(LogCategory.UI, 'Federal import failed', err as Error);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const pick = useCallback(
    () =>
      run(async () => {
        const picked = await window.electronAPI?.dialog?.openFederalFiles?.();
        if (picked) load(picked.files, picked.names);
      }),
    [load, run]
  );

  const drop = useCallback(
    (dropped: File[]) =>
      run(async () => {
        if (dropped.length === 0) return;
        const inputs = await Promise.all(
          dropped.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
        );
        const files = await window.electronAPI.file.unpackFederalFiles(inputs);
        load(
          files,
          inputs.map(i => i.name)
        );
      }),
    [load, run]
  );

  const clear = useCallback(() => {
    setResult(null);
    setNames([]);
    setError(null);
  }, []);

  const payload = useMemo<FederalCreationPayload | null>(() => {
    if (!result) return null;
    const fencers = resolveFederalFencers(result, source);
    return {
      fencers,
      teams: result.header?.fields.isTeamEvent ? resolveFederalTeams(result.teams, fencers) : [],
      referees: result.referees,
    };
  }, [result, source]);

  return { result, names, loading, error, source, setSource, pick, drop, clear, payload };
}
