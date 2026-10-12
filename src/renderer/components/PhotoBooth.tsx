/**
 * BellePoule Modern - Photo Booth Component
 * Webcam selfie capture for fencers
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { logger, LogCategory } from '@shared/services/logger';

interface PhotoBoothProps {
  onConfirm: (photoData: string) => void;
  onClose: () => void;
}

export const PhotoBooth: React.FC<PhotoBoothProps> = ({ onConfirm, onClose }) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoCallbackRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    console.log('[PhotoBooth] video ref mounted, stream available:', !!streamRef.current);
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      video
        .play()
        .then(() => console.log('[PhotoBooth] video.play() resolved'))
        .catch(err => {
          console.error('[PhotoBooth] video.play() rejected:', err);
          logger.error(LogCategory.UI, 'Error playing video stream', err as Error);
          setError(`Erreur lecture vidéo : ${(err as Error).message}`);
        });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    console.log(
      '[PhotoBooth] startCamera — navigator.mediaDevices:',
      !!navigator.mediaDevices?.getUserMedia
    );
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg =
        "L'accès à la webcam n'est pas disponible dans ce contexte (mediaDevices absent).";
      setError(msg);
      return;
    }
    try {
      console.log('[PhotoBooth] calling getUserMedia...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      console.log('[PhotoBooth] getUserMedia OK, tracks:', stream.getVideoTracks().length);
      streamRef.current = stream;
      setIsCapturing(true);
    } catch (err) {
      console.error('[PhotoBooth] getUserMedia error:', err);
      logger.error(LogCategory.UI, 'Error accessing camera', err as Error);
      const domErr = err as DOMException;
      const msg =
        domErr.name === 'NotAllowedError'
          ? `Permission refusée [${domErr.name}]. Vérifiez que l'application a accès à la caméra dans les paramètres système.`
          : domErr.name === 'NotFoundError'
            ? `Aucune caméra détectée [${domErr.name}]. Vérifiez que la webcam est connectée.`
            : `Impossible d'accéder à la caméra [${domErr.name}] : ${domErr.message || String(err)}`;
      setError(msg);
    }
  }, []);

  // Ref so capturePhoto closure always calls the latest takePhoto
  const takePhotoRef = useRef<() => void>(() => {});

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    console.log(
      '[PhotoBooth] takePhoto — readyState:',
      video.readyState,
      'size:',
      video.videoWidth,
      'x',
      video.videoHeight
    );
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setError(
        `Caméra pas encore prête (readyState=${video.readyState}, ${video.videoWidth}×${video.videoHeight}). Réessayez.`
      );
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Mirror to match selfie preview
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      ctx.restore();

      // Resize to 300×300 with centered square crop
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = 300;
      outputCanvas.height = 300;
      const outCtx = outputCanvas.getContext('2d');
      if (outCtx) {
        const side = Math.min(canvas.width, canvas.height);
        const sx = (canvas.width - side) / 2;
        const sy = (canvas.height - side) / 2;
        outCtx.drawImage(canvas, sx, sy, side, side, 0, 0, 300, 300);
        const photoData = outputCanvas.toDataURL('image/jpeg', 0.8);
        setPhoto(photoData);
        stopCamera();
      }
    } catch (err) {
      console.error('[PhotoBooth] capture error:', err);
      logger.error(LogCategory.UI, 'Error capturing photo', err as Error);
      setError(`Erreur capture : ${(err as Error).message || String(err)}`);
    }
  }, [stopCamera]);

  takePhotoRef.current = takePhoto;

  const capturePhoto = useCallback(() => {
    let count = 3;
    setCountdown(count);
    intervalRef.current = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        takePhotoRef.current();
      }
    }, 1000);
  }, []);

  const retake = () => {
    setPhoto(null);
    startCamera();
  };

  return (
    <div>
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            color: '#b91c1c',
            padding: '10px 14px',
            marginBottom: '12px',
            fontSize: '13px',
            wordBreak: 'break-word',
          }}
        >
          <strong>Erreur webcam :</strong> {error}
        </div>
      )}

      {!isCapturing && !photo && (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              backgroundColor: '#f3f4f6',
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '64px',
            }}
          >
            📷
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={startCamera}>
              Démarrer la caméra
            </button>
          </div>
        </div>
      )}

      {isCapturing && (
        <div style={{ position: 'relative' }}>
          <video
            ref={videoCallbackRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              borderRadius: '8px',
              transform: 'scaleX(-1)',
            }}
          />

          {countdown > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '100px',
                fontWeight: 'bold',
                color: 'white',
                textShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              {countdown}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={capturePhoto}
              disabled={countdown > 0}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {countdown > 0 ? `${countdown}…` : '📸 Capturer'}
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="btn btn-secondary"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {photo && (
        <div style={{ textAlign: 'center' }}>
          <img
            src={photo}
            alt="Aperçu"
            style={{
              width: '100%',
              borderRadius: '8px',
              marginBottom: '12px',
            }}
          />
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button type="button" onClick={retake} className="btn btn-secondary">
              Recommencer
            </button>
            <button type="button" onClick={() => onConfirm(photo)} className="btn btn-primary">
              Utiliser cette photo
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default React.memo(PhotoBooth);
