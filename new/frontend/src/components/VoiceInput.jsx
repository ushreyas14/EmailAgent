import React, { useState, useRef, useCallback } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { transcribeAudio } from '../utils/api';

// ─── WAV encoder ──────────────────────────────────────────────────────────────
// Converts a Float32Array of PCM samples (mono, any rate) to a 16kHz mono
// LINEAR16 WAV Blob — the format Google STT expects.
function encodeWav(float32Samples, inputSampleRate) {
  const TARGET_RATE = 16000;

  // ── Resample to 16kHz (linear interpolation) ────────────────────────────
  let samples = float32Samples;
  if (inputSampleRate !== TARGET_RATE) {
    const ratio = inputSampleRate / TARGET_RATE;
    const newLength = Math.round(float32Samples.length / ratio);
    const resampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIdx = i * ratio;
      const lo = Math.floor(srcIdx);
      const hi = Math.min(lo + 1, float32Samples.length - 1);
      const frac = srcIdx - lo;
      resampled[i] = float32Samples[lo] * (1 - frac) + float32Samples[hi] * frac;
    }
    samples = resampled;
  }

  // ── Convert Float32 [-1, 1] → Int16 PCM ────────────────────────────────
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  // ── Build WAV file (PCM header + data) ──────────────────────────────────
  const dataBytes = pcm.buffer.byteLength;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);       // PCM chunk size
  view.setUint16(20, 1, true);        // AudioFormat = PCM
  view.setUint16(22, 1, true);        // NumChannels = Mono
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true); // ByteRate
  view.setUint16(32, 2, true);        // BlockAlign
  view.setUint16(34, 16, true);       // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  // Copy PCM bytes
  new Int16Array(buffer, 44).set(pcm);

  return new Blob([buffer], { type: 'audio/wav' });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function VoiceInput({ onTranscript }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'recording' | 'processing'
  const [supported] = useState(() => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder));

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);

  // ── Start recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      chunksRef.current = [];

      // Prefer audio/webm; fallback to whatever the browser supports
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all mic tracks so the browser stops showing the recording indicator
        stream.getTracks().forEach(t => t.stop());
        await processAudio();
      };

      recorder.start(100); // collect chunks every 100 ms
      setStatus('recording');
      toast.info('🎙️ Recording… click Stop when done.', { autoClose: 3000 });
    } catch (err) {
      console.error('[VoiceInput] getUserMedia error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Microphone permission denied. Please allow mic access and try again.');
      } else {
        toast.error(`Could not start recording: ${err.message}`);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop recording ───────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setStatus('processing');
    }
  }, []);

  // ── Process raw audio → WAV → backend → transcript ───────────────────────
  const processAudio = useCallback(async () => {
    try {
      if (chunksRef.current.length === 0) {
        toast.warn('No audio data recorded. Please try again.');
        setStatus('idle');
        return;
      }

      const rawBlob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });

      // Decode audio using Web Audio API, then re-encode as 16kHz mono WAV
      const arrayBuffer = await rawBlob.arrayBuffer();

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const audioCtx = audioCtxRef.current;

      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Mix down to mono (average all channels)
      const numChannels = audioBuffer.numberOfChannels;
      const length = audioBuffer.length;
      const mono = new Float32Array(length);
      for (let ch = 0; ch < numChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          mono[i] += channelData[i] / numChannels;
        }
      }

      const wavBlob = encodeWav(mono, audioBuffer.sampleRate);

      // Send to backend
      const formData = new FormData();
      formData.append('audio', wavBlob, 'recording.wav');

      const result = await transcribeAudio(formData);

      if (!result.transcript) {
        toast.warn('No speech detected. Please speak clearly and try again.');
        setStatus('idle');
        return;
      }

      toast.success('✅ Transcription complete!', { autoClose: 2000 });

      // Fire the same onTranscript callback the old Web Speech API used,
      // so App.jsx handleVoiceTranscript → handleParse runs unchanged.
      onTranscript(result.transcript);

    } catch (err) {
      console.error('[VoiceInput] Processing error:', err);
      toast.error(err.message || 'Failed to transcribe audio. Please try again.');
    } finally {
      setStatus('idle');
      chunksRef.current = [];
    }
  }, [onTranscript]);

  const handleToggle = () => {
    if (status === 'recording') {
      stopRecording();
    } else if (status === 'idle') {
      startRecording();
    }
    // 'processing' — button is disabled, do nothing
  };

  // ── Unsupported browser ──────────────────────────────────────────────────
  if (!supported) {
    return (
      <div className="voice-unsupported">
        🎙️ Voice input requires a modern browser with microphone support (Chrome, Edge, Firefox).
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const isRecording  = status === 'recording';
  const isProcessing = status === 'processing';

  return (
    <div className="voice-input-container">
      <button
        id="voice-record-btn"
        className={`voice-button ${isRecording ? 'listening' : ''} ${isProcessing ? 'processing' : ''}`}
        onClick={handleToggle}
        disabled={isProcessing}
        type="button"
        title={isRecording ? 'Stop recording' : isProcessing ? 'Processing…' : 'Start voice input'}
      >
        {isProcessing ? (
          <>
            <Loader2 size={20} className="spin" />
            Transcribing…
          </>
        ) : isRecording ? (
          <>
            <Square size={20} />
            Stop Recording
          </>
        ) : (
          <>
            <Mic size={20} />
            Start Voice Input
          </>
        )}
      </button>

      {isRecording && (
        <div className="listening-indicator">
          <span className="recording-dot" />
          <span className="recording-dot" />
          <span className="recording-dot" />
          Listening… speak now, then click Stop.
        </div>
      )}

      {isProcessing && (
        <div className="processing-indicator">
          Sending to Google Speech-to-Text…
        </div>
      )}

      <span className="voice-stt-badge">Powered by Google STT</span>
    </div>
  );
}
