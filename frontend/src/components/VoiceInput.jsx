import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from 'react-toastify';

export default function VoiceInput({ onTranscript }) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event) => {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        onTranscript(finalTranscript);
        // Optionally stop after one command, or let it run
        stopListening();
      }
    };

    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      if (event.error !== 'no-speech') {
        toast.error(`Voice input error: ${event.error}`);
      }
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onTranscript]);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const startListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        toast.info('Listening for your command...', { autoClose: 2000 });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  if (!supported) {
    return (
      <div className="voice-unsupported">
        Voice input is not supported in this browser. Please use Chrome or Edge.
      </div>
    );
  }

  return (
    <div className="voice-input-container">
      <button 
        className={`voice-button ${isListening ? 'listening' : ''}`}
        onClick={toggleListening}
        type="button"
      >
        {isListening ? (
          <>
            <Square size={20} className="pulse" />
            Stop Recording
          </>
        ) : (
          <>
            <Mic size={20} />
            Start Voice Input
          </>
        )}
      </button>
      {isListening && <div className="listening-indicator">Listening... Speak now.</div>}
    </div>
  );
}
