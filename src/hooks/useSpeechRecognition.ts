
// Extend Window interface for Web Speech API
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

import { useState, useRef, useEffect } from 'react';

interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  lang?: string;
}

export const useSpeechRecognition = (options: UseSpeechRecognitionOptions = {}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fullTranscriptRef = useRef('');

  const onResultRef = useRef(options.onResult);
  const onErrorRef = useRef(options.onError);

  useEffect(() => {
    onResultRef.current = options.onResult;
    onErrorRef.current = options.onError;
  }, [options.onResult, options.onError]);

  useEffect(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

    if (SpeechRecognition) {
      setTimeout(() => setIsSupported(true), 0);
      recognitionRef.current = new SpeechRecognition();

      recognitionRef.current.continuous = false; // Stay with user preference
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-IN'; // Better for India

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setTranscript('');
        fullTranscriptRef.current = '';
      };

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalSegment = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const resultTranscript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalSegment += resultTranscript;
          } else {
            interimTranscript += resultTranscript;
          }
        }

        if (finalSegment) {
          fullTranscriptRef.current += (fullTranscriptRef.current ? ' ' : '') + finalSegment;
        }

        setTranscript((fullTranscriptRef.current + ' ' + interimTranscript).trim());
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        onErrorRef.current?.(event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        // ONLY call onResult when the session truly ends to get the full timing right
        const finalOutput = fullTranscriptRef.current.trim();
        if (finalOutput) {
          onResultRef.current?.(finalOutput);
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Update language dynamically
  useEffect(() => {
    if (recognitionRef.current && options.lang) {
      let speechLang = 'en-IN';
      if (options.lang === 'hi') speechLang = 'hi-IN';
      if (options.lang === 'te') speechLang = 'te-IN';
      recognitionRef.current.lang = speechLang;
    }
  }, [options.lang]);

  const startListening = () => {
    if (isSupported && recognitionRef.current) {
      setTranscript('');
      fullTranscriptRef.current = '';
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
        recognitionRef.current.stop();
        setTimeout(() => recognitionRef.current.start(), 100);
      }
    }
  };

  const stopListening = () => {
    if (isSupported && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const resetTranscript = () => {
    setTranscript('');
    fullTranscriptRef.current = '';
  };

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
};
