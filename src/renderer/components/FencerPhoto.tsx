/**
 * BellePoule Modern - Fencer Photo Management
 * Component for uploading and displaying fencer photos
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useCallback } from 'react';
import { logger, LogCategory } from '@shared/services/logger';
import PhotoBooth from './PhotoBooth';
import { useToast } from './Toast';

interface FencerPhotoProps {
  photo?: string;
  firstName: string;
  lastName: string;
  onPhotoChange?: (photoBase64: string | undefined) => void;
  size?: 'small' | 'medium' | 'large';
  editable?: boolean;
}

export const FencerPhoto: React.FC<FencerPhotoProps> = ({
  photo,
  firstName,
  lastName,
  onPhotoChange,
  size = 'medium',
  editable = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const sizeClasses = {
    small: 'w-10 h-10 text-xs',
    medium: 'w-16 h-16 text-sm',
    large: 'w-24 h-24 text-base',
  };

  const getInitials = () => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase();
  };

  const resizeImage = (
    file: File,
    maxWidth: number = 300,
    maxHeight: number = 300
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Convert to base64 with JPEG compression
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          resolve(base64);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        showToast('Veuillez sélectionner une image valide', 'error');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showToast("L'image ne doit pas dépasser 5 Mo", 'error');
        return;
      }

      setIsLoading(true);
      try {
        const base64 = await resizeImage(file);
        onPhotoChange?.(base64);
      } catch (error) {
        logger.error(LogCategory.UI, 'Error processing image', error as Error);
        showToast("Erreur lors du traitement de l'image", 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [onPhotoChange, showToast]
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);

      const file = event.dataTransfer.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Veuillez déposer une image valide', 'error');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showToast("L'image ne doit pas dépasser 5 Mo", 'error');
        return;
      }

      setIsLoading(true);
      try {
        const base64 = await resizeImage(file);
        onPhotoChange?.(base64);
      } catch (error) {
        logger.error(LogCategory.UI, 'Error processing image', error as Error);
        showToast("Erreur lors du traitement de l'image", 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [onPhotoChange, showToast]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleRemovePhoto = useCallback(() => {
    onPhotoChange?.(undefined);
  }, [onPhotoChange]);

  return (
    <div className="relative inline-block">
      <div
        className={`
          ${sizeClasses[size]}
          rounded-full overflow-hidden cursor-pointer
          flex items-center justify-center
          transition-all duration-200
          ${isDragging ? 'ring-4 ring-blue-400 scale-105' : ''}
          ${editable ? 'hover:ring-2 hover:ring-blue-300' : ''}
          ${photo ? '' : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold'}
        `}
        onClick={() => editable && fileInputRef.current?.click()}
        onDrop={editable ? handleDrop : undefined}
        onDragOver={editable ? handleDragOver : undefined}
        onDragLeave={editable ? handleDragLeave : undefined}
        title={editable ? 'Cliquer ou glisser-déposer une photo' : ''}
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-1/2 w-1/2 border-2 border-white border-t-transparent" />
        ) : photo ? (
          <img
            src={photo}
            alt={`${firstName} ${lastName}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{getInitials()}</span>
        )}
      </div>

      {editable && photo && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            handleRemovePhoto();
          }}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
          title="Supprimer la photo"
        >
          ×
        </button>
      )}

      {editable && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            setShowWebcam(true);
          }}
          className="absolute -bottom-1 -right-1 h-8 px-2 bg-blue-500 text-white rounded-md flex items-center justify-center gap-1 hover:bg-blue-600 transition-colors shadow-md"
          title="Prendre une photo avec la webcam"
          style={{ fontSize: '14px' }}
        >
          📷 <span style={{ fontSize: '11px', fontWeight: 500 }}>Webcam</span>
        </button>
      )}

      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      )}

      {isDragging && (
        <div className="absolute inset-0 bg-blue-500 bg-opacity-20 rounded-full flex items-center justify-center pointer-events-none">
          <span className="text-blue-700 text-xs font-medium">Déposer ici</span>
        </div>
      )}

      {editable && showWebcam && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
          onClick={() => setShowWebcam(false)}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              padding: '1.5rem',
              width: '480px',
              maxWidth: '90vw',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                Prendre une photo
              </h3>
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                onClick={() => setShowWebcam(false)}
                style={{ padding: '0.25rem' }}
              >
                ✕
              </button>
            </div>
            <PhotoBooth
              onConfirm={photoData => {
                onPhotoChange?.(photoData);
                setShowWebcam(false);
              }}
              onClose={() => setShowWebcam(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(FencerPhoto);
