/**
 * BellePoule Modern - Voice Control Feature
 * Hands-free score entry using voice recognition
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback } from 'react';

interface VoiceCommand {
  command: string;
  action: (params?: string[]) => void;
  description: string;
}

const LANG_CONFIG: Record<
  string,
  { locale: string; score: RegExp; increment: RegExp; start: RegExp; pause: RegExp; finish: RegExp }
> = {
  fr: {
    locale: 'fr-FR',
    score: /(?:score|mettre|set)\s+([ab])\s+(\d+)/i,
    increment: /(?:plus|ajouter|add)\s+([ab])/i,
    start: /(?:démarrer|commencer|start|go)/i,
    pause: /(?:pause|stop|arrêter)/i,
    finish: /(?:terminer|fini|fin|end)/i,
  },
  en: {
    locale: 'en-US',
    score: /(?:score|set)\s+([ab])\s+(\d+)/i,
    increment: /(?:plus|add|increment)\s+([ab])/i,
    start: /(?:start|begin|go)/i,
    pause: /(?:pause|stop)/i,
    finish: /(?:finish|done|end)/i,
  },
  de: {
    locale: 'de-DE',
    score: /(?:stand|score|set)\s+([ab])\s+(\d+)/i,
    increment: /(?:punkt|plus|add)\s+([ab])/i,
    start: /(?:start|starten|beginnen)/i,
    pause: /(?:pause|stop)/i,
    finish: /(?:beenden|fertig|ende)/i,
  },
};

export const VoiceScoreController: React.FC<{
  onScoreA?: (score: number) => void;
  onScoreB?: (score: number) => void;
  onStart?: () => void;
  onPause?: () => void;
  onFinish?: () => void;
  language?: string;
}> = ({ onScoreA, onScoreB, onStart, onPause, onFinish, language = 'fr' }) => {
  const langKey = Object.keys(LANG_CONFIG).find(k => language.startsWith(k)) ?? 'fr';
  const lang = LANG_CONFIG[langKey];
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastCommand, setLastCommand] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);

  const commands: VoiceCommand[] = [
    {
      command: 'score [A|B] [number]',
      action: params => {
        if (params && params.length >= 2) {
          const player = params[0].toUpperCase();
          const score = parseInt(params[1]);
          if (!isNaN(score)) {
            if (player === 'A') {
              setScoreA(score);
              onScoreA?.(score);
            }
            if (player === 'B') {
              setScoreB(score);
              onScoreB?.(score);
            }
          }
        }
      },
      description: 'Définir le score (ex: "score A 5")',
    },
    {
      command: 'démarrer|start|commencer',
      action: () => onStart?.(),
      description: 'Démarrer le match',
    },
    {
      command: 'pause|stop',
      action: () => onPause?.(),
      description: 'Mettre en pause',
    },
    {
      command: 'terminer|fini|fin',
      action: () => onFinish?.(),
      description: 'Terminer le match',
    },
    {
      command: 'plus [A|B]',
      action: params => {
        if (params && params[0]) {
          const player = params[0].toUpperCase();
          if (player === 'A') {
            const newScore = scoreA + 1;
            setScoreA(newScore);
            onScoreA?.(newScore);
          }
          if (player === 'B') {
            const newScore = scoreB + 1;
            setScoreB(newScore);
            onScoreB?.(newScore);
          }
        }
      },
      description: 'Ajouter un point (ex: "plus A")',
    },
  ];

  const processCommand = useCallback(
    (text: string) => {
      const lowerText = text.toLowerCase().trim();

      const scoreMatch = lowerText.match(lang.score);
      if (scoreMatch) {
        commands[0].action([scoreMatch[1], scoreMatch[2]]);
        setLastCommand(`Score ${scoreMatch[1].toUpperCase()}: ${scoreMatch[2]}`);
        return;
      }

      const plusMatch = lowerText.match(lang.increment);
      if (plusMatch) {
        commands[4].action([plusMatch[1]]);
        setLastCommand(`+1 ${plusMatch[1].toUpperCase()}`);
        return;
      }

      if (lang.start.test(lowerText)) {
        commands[1].action();
        setLastCommand('▶ Démarré');
      } else if (lang.pause.test(lowerText)) {
        commands[2].action();
        setLastCommand('⏸ Pause');
      } else if (lang.finish.test(lowerText)) {
        commands[3].action();
        setLastCommand('⏹ Terminé');
      }
    },
    [commands]
  );

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError("La reconnaissance vocale n'est pas supportée par ce navigateur");
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang.locale;

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      setTranscript(transcript);

      if (event.results[current].isFinal) {
        processCommand(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      setError(`Erreur: ${event.error}`);
      setIsListening(false);
    };

    if (isListening) {
      recognition.start();
    }

    return () => {
      recognition.stop();
    };
  }, [isListening, processCommand]);

  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        maxWidth: '400px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: isListening ? '#ef4444' : '#e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            transition: 'all 0.3s',
            animation: isListening ? 'pulse 1.5s infinite' : 'none',
          }}
        >
          🎤
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px' }}>Contrôle Vocal</h3>
          <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
            {isListening ? 'Écoute en cours...' : 'Appuyez pour activer'}
          </p>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#fee2e2',
            borderRadius: '8px',
            color: '#991b1b',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={() => setIsListening(!isListening)}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: isListening ? '#ef4444' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {isListening ? "Arrêter l'écoute" : 'Activer la voix'}
      </button>

      {transcript && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        >
          <strong>Dernière commande:</strong> {transcript}
        </div>
      )}

      {lastCommand && (
        <div
          style={{
            marginTop: '8px',
            padding: '12px',
            backgroundColor: '#d1fae5',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#065f46',
          }}
        >
          ✅ {lastCommand}
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#374151' }}>
          Commandes disponibles:
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#6b7280' }}>
          {commands.map((cmd, idx) => (
            <li key={idx}>{cmd.description}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default React.memo(VoiceScoreController);
