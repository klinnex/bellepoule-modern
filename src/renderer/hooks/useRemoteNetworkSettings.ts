/**
 * BellePoule Modern - Réglages réseau du serveur distant (HTTPS, port, interface) (#1241)
 * Extrait de RemoteScoreManager. Valeurs initiales lues dans localStorage.
 * Licensed under GPL-3.0
 */
import { useEffect, useState } from 'react';

export function useRemoteNetworkSettings(competitionId: string) {
  const [useHttps, setUseHttps] = useState<boolean>(() => {
    // HTTPS par défaut : HTTP seulement si désactivé explicitement
    return localStorage.getItem('bellepoule-remote-https') !== 'false';
  });
  const [certFingerprint, setCertFingerprint] = useState<string | null>(null);
  const [remotePort, setRemotePort] = useState<number>(() => {
    const saved = localStorage.getItem(`bellepoule-remote-port-${competitionId}`);
    return saved ? parseInt(saved, 10) : 8066;
  });
  const [networkInterfaces, setNetworkInterfaces] = useState<{ name: string; address: string }[]>([
    { name: 'Toutes les interfaces', address: '0.0.0.0' },
  ]);
  const [selectedInterface, setSelectedInterface] = useState<string>(() => {
    return localStorage.getItem('bellepoule-remote-interface') ?? '0.0.0.0';
  });

  useEffect(() => {
    window.electronAPI.remote.getNetworkInterfaces().then((res: any) => {
      if (res?.success && res.interfaces?.length) {
        setNetworkInterfaces(res.interfaces);
      }
    });
  }, []);

  return {
    useHttps,
    setUseHttps,
    certFingerprint,
    setCertFingerprint,
    remotePort,
    setRemotePort,
    networkInterfaces,
    selectedInterface,
    setSelectedInterface,
  };
}
