import { useCallback, useEffect, useRef, useState } from 'react';

// Voice for PULSE AI: the phone's own speech service turns speech into text (Google on Android,
// Apple on iPhone). PULSE only gets the text. Indian English, which also catches Hinglish words.
// Where the browser has no speech service, `supported` is false and no mic is shown.

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const voiceSupported = () => !!ctor();

/** Spoken numbers come back as words sometimes ("three hundred"); amounts in digits read better. */
function tidy(text: string) {
  return text
    .replace(/\brupees?\b|\brs\.?\b/gi, '₹')
    .replace(/₹\s*(\d)/g, '₹$1')
    .replace(/(\d)\s*₹/g, '₹$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Listen once. `onText(text, final)` is called as words come in, and once more with final = true
 * when the person stops talking.
 */
export function useVoice(onText: (text: string, final: boolean) => void, onProblem?: (msg: string) => void) {
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  const problem = useRef(onProblem);
  problem.current = onProblem;
  const supported = voiceSupported();

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C || rec.current) return;
    let r: Recognition;
    try {
      r = new C();
    } catch {
      problem.current?.('Voice isn’t available here. Type your question instead.');
      return;
    }
    r.lang = 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let text = '';
    let sent = false;
    r.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      text = tidy(final || interim);
      cb.current(text, false);
      if (final && !sent) {
        sent = true;
        cb.current(tidy(final), true);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') problem.current?.('The microphone is blocked. Allow it for PULSE in your phone’s settings, then try again.');
      else if (e.error === 'network') problem.current?.('Voice needs the internet. Type your question instead.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') problem.current?.('Didn’t catch that. Try again, or type it.');
    };
    r.onend = () => {
      if (text && !sent) cb.current(text, true);
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      problem.current?.('Voice isn’t available here. Type your question instead.');
    }
  }, []);

  useEffect(() => () => rec.current?.abort(), []);
  return { supported, listening, start, stop };
}
