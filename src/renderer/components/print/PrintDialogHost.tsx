/**
 * BellePoule Modern - Hôte de la boîte d'impression intégrée (#1214)
 * Enregistre auprès du preload le gestionnaire des demandes `file.printHtml` : chaque bouton
 * « Imprimer » ouvre la boîte (chargée à la demande) et reçoit son résultat.
 * Licensed under GPL-3.0
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { PrintDialogResult } from './PrintDialog';

const PrintDialog = React.lazy(() => import('./PrintDialog'));

interface PrintRequest {
  html: string;
  resolve: (result: PrintDialogResult) => void;
}

const PrintDialogHost: React.FC = () => {
  const [request, setRequest] = useState<PrintRequest | null>(null);
  const current = useRef<PrintRequest | null>(null);

  const open = useCallback(
    (html: string) =>
      new Promise<PrintDialogResult>(resolve => {
        // Une seule boîte à la fois : la précédente est annulée
        current.current?.resolve({ success: true, canceled: true });
        const next = { html, resolve };
        current.current = next;
        setRequest(next);
      }),
    []
  );

  useEffect(() => {
    const api = window.electronAPI?.printDialog;
    api?.setHandler(open);
    return () => api?.setHandler(null);
  }, [open]);

  if (!request) return null;
  return (
    <Suspense fallback={null}>
      <PrintDialog
        key={request.html.length + ':' + request.html.slice(0, 64)}
        html={request.html}
        onDone={result => {
          request.resolve(result);
          if (current.current === request) current.current = null;
          setRequest(null);
        }}
      />
    </Suspense>
  );
};

export default PrintDialogHost;
