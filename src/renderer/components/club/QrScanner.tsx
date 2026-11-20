/**
 * BellePoule Modern - Lecteur de QR codes par webcam (Mode Club #1872).
 * BarcodeDetector natif si disponible, sinon jsQR (chargé à la demande).
 * Licensed under GPL-3.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface QrScannerProps {
  /** Texte décodé (appelé à chaque lecture, au plus toutes les SCAN_MS) */
  onDecode: (text: string) => void;
}

const SCAN_MS = 250;

type Decoder = (canvas: HTMLCanvasElement) => Promise<string | null>;

interface NativeDetector {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}

async function createDecoder(): Promise<Decoder> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: object) => NativeDetector })
    .BarcodeDetector;
  if (BD) {
    try {
      const detector = new BD({ formats: ['qr_code'] });
      return async canvas => (await detector.detect(canvas))[0]?.rawValue ?? null;
    } catch {
      /* format non pris en charge : repli jsQR */
    }
  }
  const jsQR = (await import('jsqr')).default;
  return async canvas => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

export const QrScanner: React.FC<QrScannerProps> = ({ onDecode }) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDecodeRef = useRef(onDecode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const canvas = document.createElement('canvas');

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t('clubSession.camera_unavailable'));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch {
        setError(t('clubSession.camera_denied'));
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach(tr => tr.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const decode = await createDecoder();
      let busy = false;
      timer = setInterval(() => {
        if (busy || !video.videoWidth) return;
        busy = true;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        decode(canvas)
          .then(text => {
            if (text && !cancelled) onDecodeRef.current(text);
          })
          .catch(() => undefined)
          .finally(() => {
            busy = false;
          });
      }, SCAN_MS);
    };
    void start();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach(tr => tr.stop());
    };
  }, [t]);

  return (
    <div className="club-scanner">
      {error ? (
        <p className="club-scanner-error" role="alert">
          {error}
        </p>
      ) : (
        <video ref={videoRef} className="club-scanner-video" muted playsInline />
      )}
    </div>
  );
};
