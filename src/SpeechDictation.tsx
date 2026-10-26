import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import type { L } from './NodeEditor';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

export function SpeechDictation({
  value,
  language,
  disabled,
  L,
  onText,
  onListeningChange,
  onError,
}: {
  value: string;
  language: 'fr' | 'en';
  disabled: boolean;
  L: L;
  onText: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  onError: (message: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const current = useRef<Recognition | null>(null);
  const callbacks = useRef({ onText, onListeningChange, onError });
  callbacks.current = { onText, onListeningChange, onError };
  const host = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  const Constructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  useEffect(
    () => () => {
      const recognition = current.current;
      current.current = null;
      if (recognition) {
        recognition.onresult = recognition.onerror = recognition.onend = null;
        recognition.abort();
      }
    },
    [],
  );
  useEffect(() => {
    if (disabled && current.current) current.current.stop();
  }, [disabled]);
  function toggle() {
    if (current.current) {
      current.current.stop();
      return;
    }
    if (!Constructor) return;
    const recognition = new Constructor();
    const prefix = value;
    recognition.lang = language === 'fr' ? 'fr-FR' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    const finish = () => {
      if (current.current !== recognition) return;
      current.current = null;
      setListening(false);
      callbacks.current.onListeningChange(false);
    };
    recognition.onresult = (event) => {
      if (current.current !== recognition) return;
      // Results include prior finalized segments: rebuild rather than append duplicates.
      const transcript = Array.from(event.results, (result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      callbacks.current.onText(
        prefix + (prefix && !/\s$/.test(prefix) && transcript ? ' ' : '') + transcript,
      );
    };
    recognition.onend = finish;
    recognition.onerror = (event) => {
      if (current.current !== recognition) return;
      finish();
      recognition.abort();
      if (event.error === 'aborted') return;
      const message =
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? L(
              'Accès au microphone ou à la reconnaissance vocale refusé. Vérifiez les autorisations du système.',
              'Microphone or speech recognition access denied. Check system permissions.',
            )
          : event.error === 'audio-capture'
            ? L('Aucun microphone disponible.', 'No microphone available.')
            : event.error === 'no-speech'
              ? L(
                  'Aucune parole détectée. Réessayez avec le microphone.',
                  'No speech detected. Try the microphone again.',
                )
              : L(
                  'La transcription vocale est indisponible dans cet environnement.',
                  'Speech transcription is unavailable in this environment.',
                );
      callbacks.current.onError(message);
    };
    try {
      current.current = recognition;
      setListening(true);
      callbacks.current.onListeningChange(true);
      recognition.start();
    } catch {
      finish();
      recognition.abort();
      callbacks.current.onError(
        L('Impossible de démarrer la dictée vocale.', 'Unable to start voice dictation.'),
      );
    }
  }
  const label = !Constructor
    ? L(
        'Dictée vocale indisponible dans cet environnement',
        'Voice dictation unavailable in this environment',
      )
    : listening
      ? L('Arrêter la dictée', 'Stop dictation')
      : L('Dicter la demande', 'Dictate request');
  return (
    <button
      type="button"
      className="icon-button speech-dictation"
      aria-label={label}
      title={label}
      aria-pressed={listening}
      disabled={!Constructor || disabled}
      onClick={toggle}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}
