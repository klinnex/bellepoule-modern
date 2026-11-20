/**
 * BellePoule Modern - Fournisseur du client d'API de l'écran (#1981)
 * Les composants appellent useBpmClient() au lieu de window.electronAPI.
 * Licensed under GPL-3.0
 */
import React, { createContext, useContext } from 'react';
import type { BpmClient } from '../../shared/api/client';
import { defaultBpmClient } from './IpcClient';

const BpmClientContext = createContext<BpmClient>(defaultBpmClient);

export function BpmClientProvider({
  client = defaultBpmClient,
  children,
}: {
  client?: BpmClient;
  children: React.ReactNode;
}) {
  return <BpmClientContext.Provider value={client}>{children}</BpmClientContext.Provider>;
}

export const useBpmClient = (): BpmClient => useContext(BpmClientContext);
