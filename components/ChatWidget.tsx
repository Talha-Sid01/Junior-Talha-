"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  sources?: string[];
  isGrounded?: boolean;
  isStreaming?: boolean;
  hasError?: boolean;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  "What's Talha's superpower? 💪",
  "Show me his coolest projects",
  "What kind of freelance work does he do?",
  "Give me the quick rundown on Talha",
];

export default function ChatWidget() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Voice state ───────────────────────────────────────────────
  const [voiceStatus, setVoiceStatus] = useState<
    "idle" | "listening" | "transcribing" | "speaking"
  >("idle");
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const isSpeakerMutedRef = useRef(false);
  const [micError, setMicError] = useState<string | null>(null);
  
  const voiceTriggered = useRef(false); // Was the current message initiated by voice?
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const ttsQueueRef = useRef<string[]>([]);
  const ttsPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const sentenceBufferRef = useRef("");

  // ── Typewriter queue ──────────────────────────────────────────
  // Characters are buffered here and drained one-by-one with a delay
  const typewriterQueue = useRef<string[]>([]);
  const typewriterDraining = useRef(false);
  const typewriterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDone = useRef<{ is_grounded: boolean; sources: string[] } | null>(null);
  const activeBotId = useRef<string | null>(null);

  const CHAR_DELAY_MS = 18; // ms per character — tune for desired speed

  // ── Voice Functions ──────────────────────────────────────────

  const playTTS = async (text: string) => {
    if (isSpeakerMutedRef.current) return;
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      ttsQueueRef.current.push(url);
      playNextTTS();
    } catch (err) {
      console.error("TTS Error:", err);
    }
  };

  const playNextTTS = () => {
    if (ttsPlayingRef.current || ttsQueueRef.current.length === 0) {
      if (ttsQueueRef.current.length === 0 && voiceStatus === "speaking" && !isLoading) {
        setVoiceStatus("idle");
      }
      return;
    }
    ttsPlayingRef.current = true;
    setVoiceStatus("speaking");
    
    const url = ttsQueueRef.current.shift()!;
    const audio = new Audio(url);
    currentAudioRef.current = audio;
    
    audio.onended = () => {
      URL.revokeObjectURL(url);
      ttsPlayingRef.current = false;
      currentAudioRef.current = null;
      if (ttsQueueRef.current.length > 0) {
        playNextTTS();
      } else {
        if (!isLoading) {
          setVoiceStatus("idle");
        }
      }
    };
    
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      ttsPlayingRef.current = false;
      currentAudioRef.current = null;
      playNextTTS();
    };
    
    audio.play().catch((e) => {
      console.error("Audio playback prevented", e);
      URL.revokeObjectURL(url);
      ttsPlayingRef.current = false;
      currentAudioRef.current = null;
      playNextTTS();
    });
  };

  const checkSilence = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "recording" || !analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
    
    if (average < 15) { // Tune threshold if needed
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          stopRecording();
        }, 1200);
      }
    } else {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }
    
    requestAnimationFrame(checkSilence);
  }, []);

  const startRecording = async () => {
    try {
      setMicError(null);
      
      // Stop current playback if any
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      ttsQueueRef.current = [];
      ttsPlayingRef.current = false;
      if (voiceStatus === "speaking") setVoiceStatus("idle");

      // Stop any existing stream before requesting a new one to prevent hardware locks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }

      // Add basic constraints which sometimes helps Chrome initialize the driver correctly
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      // Find a supported mime type
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
          if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else {
            mimeType = ''; // Let the browser pick its default
          }
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = async () => {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        
        // Cleanup streams
        stream.getTracks().forEach(track => track.stop());
        if (audioContext.state !== 'closed') audioContext.close();
        
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        if (audioBlob.size === 0) {
          setVoiceStatus("idle");
          return;
        }
        
        setVoiceStatus("transcribing");
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, `recording.${ext}`);
          const res = await fetch("/api/voice/transcribe", {
             method: "POST",
             body: formData
          });
          
          if (!res.ok) throw new Error("Transcription failed");
          
          const data = await res.json();
          if (data.text && data.text.trim()) {
            setInput(data.text.trim());
            sendMessage(data.text.trim(), true); // Send as voice
          } else {
             setVoiceStatus("idle");
          }
        } catch (err) {
          console.error("Transcribe error:", err);
          setMicError("Failed to transcribe audio.");
          setVoiceStatus("idle");
        }
      };
      
      mediaRecorder.start();
      setVoiceStatus("listening");
      requestAnimationFrame(checkSilence);
      
    } catch (err: any) {
      console.error("Microphone setup error:", err);
      if (err.name === "NotAllowedError" || err.name === "NotFoundError") {
         setMicError("🎤 Microphone access denied or not found.");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
         setMicError("🎤 Mic is blocked by another app (like Zoom) or Windows privacy settings.");
      } else {
         setMicError(`Microphone error: ${err.message || err.name || 'Not supported'}`);
      }
      setVoiceStatus("idle");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  // ── Typewriter drain logic ──────────────────────────────────────

  const drainTypewriterQueue = useCallback(() => {
    if (typewriterDraining.current) return;
    typewriterDraining.current = true;

    const drainNext = () => {
      const botId = activeBotId.current;
      if (!botId) {
        typewriterDraining.current = false;
        return;
      }

      if (typewriterQueue.current.length > 0) {
        const char = typewriterQueue.current.shift()!;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId ? { ...m, content: m.content + char } : m
          )
        );
        typewriterTimer.current = setTimeout(drainNext, CHAR_DELAY_MS);
      } else if (pendingDone.current) {
        // Queue is empty and we have a pending "done" event — finalize
        const done = pendingDone.current;
        pendingDone.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? {
                  ...m,
                  isStreaming: false,
                  isGrounded: done.is_grounded,
                  sources: done.sources,
                }
              : m
          )
        );
        typewriterDraining.current = false;
        activeBotId.current = null;
        setIsLoading(false);
        abortRef.current = null;
        inputRef.current?.focus();
        
        if (ttsQueueRef.current.length === 0 && !ttsPlayingRef.current) {
          setVoiceStatus("idle");
        }
      } else {
        // Queue is empty but stream might still be sending tokens — wait and retry
        typewriterDraining.current = false;
      }
    };

    drainNext();
  }, [voiceStatus]);

  // Cleanup typewriter timer on unmount
  useEffect(() => {
    return () => {
      if (typewriterTimer.current) clearTimeout(typewriterTimer.current);
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── SSE stream consumer ──────────────────────────────────────
  const sendMessage = async (text: string, isVoice = false) => {
    if (!text.trim() || isLoading) return;

    voiceTriggered.current = isVoice;
    sentenceBufferRef.current = "";
    
    // Stop TTS if it's currently speaking
    if (currentAudioRef.current) {
       currentAudioRef.current.pause();
       currentAudioRef.current = null;
    }
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;
    
    if (voiceStatus !== "transcribing") {
      setVoiceStatus("idle");
    }

    // Reset typewriter state
    typewriterQueue.current = [];
    pendingDone.current = null;
    if (typewriterTimer.current) {
      clearTimeout(typewriterTimer.current);
      typewriterTimer.current = null;
    }
    typewriterDraining.current = false;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    const botId = `bot-${Date.now()}`;
    activeBotId.current = botId;

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: botId,
        role: "bot",
        content: "",
        isStreaming: true,
        timestamp: new Date(),
      },
    ]);
    setInput("");
    setIsLoading(true);

    // Abort controller for cleanup
    abortRef.current = new AbortController();

    try {
      // Build conversation history from previous completed messages
      // (exclude the user message + bot placeholder we just added)
      const history = messages
        .filter((m) => !m.isStreaming && !m.hasError && m.content)
        .slice(-3) // Keep last 3 messages for concise context
        .map((m) => ({
          role: m.role === "user" ? "user" as const : "assistant" as const,
          content: m.content,
        }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
        signal: abortRef.current.signal,
      });

      // Non-stream error responses (rate limit, validation)
      if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? {
                  ...m,
                  content: data.answer || data.error || "Something went wrong.",
                  isStreaming: false,
                  isGrounded: data.is_grounded,
                  sources: data.sources,
                }
              : m
          )
        );
        setIsLoading(false);
        return;
      }

      // SSE stream consumption
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete last chunk

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;

          const lines = eventBlock.split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);
            }
          }

          if (!eventType || !eventData) continue;

          try {
            const parsed = JSON.parse(eventData);

            if (eventType === "token") {
              // Push characters into the typewriter queue instead of rendering instantly
              const textChunk = parsed.text as string;
              const chars = textChunk.split("");
              typewriterQueue.current.push(...chars);
              // Kick the drain loop if it's not already running
              drainTypewriterQueue();
              
              if (voiceTriggered.current && !isSpeakerMutedRef.current) {
                sentenceBufferRef.current += textChunk;
                // Check if buffer contains a sentence ending
                const match = sentenceBufferRef.current.match(/([.!?]+)(?:\s|$)/);
                if (match) {
                   const index = match.index! + match[1].length;
                   const chunkToSpeak = sentenceBufferRef.current.slice(0, index).trim();
                   sentenceBufferRef.current = sentenceBufferRef.current.slice(index);
                   if (chunkToSpeak) playTTS(chunkToSpeak);
                }
              }
              
            } else if (eventType === "done") {
              // Speak any remaining buffer
              if (voiceTriggered.current && !isSpeakerMutedRef.current && sentenceBufferRef.current.trim()) {
                 playTTS(sentenceBufferRef.current.trim());
                 sentenceBufferRef.current = "";
              }
              
              // Defer "done" until the queue finishes draining
              pendingDone.current = {
                is_grounded: parsed.is_grounded,
                sources: parsed.sources,
              };
              // Kick drain in case the queue is already empty
              drainTypewriterQueue();
            } else if (eventType === "error") {
              // Errors show immediately — flush queue into content
              const remaining = typewriterQueue.current.join("");
              typewriterQueue.current = [];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === botId
                    ? {
                        ...m,
                        isStreaming: false,
                        hasError: true,
                        content: m.content + remaining,
                      }
                    : m
                )
              );
              setIsLoading(false);
              abortRef.current = null;
            }
          } catch (e) {
            console.error("Failed to parse SSE event", e);
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Stream aborted");
      } else {
        console.error("Stream error:", err);
        const remaining = typewriterQueue.current.join("");
        typewriterQueue.current = [];
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? {
                  ...m,
                  isStreaming: false,
                  hasError: true,
                  content: m.content + remaining,
                }
              : m
          )
        );
        setIsLoading(false);
        abortRef.current = null;
      }
    }
  };

  const retryMessage = (originalContent: string) => {
    // Remove the failed bot message and resend
    setMessages((prev) => {
      const lastBotIdx = prev.findLastIndex(
        (m) => m.role === "bot" && m.hasError
      );
      if (lastBotIdx >= 0) {
        return prev.filter((_, i) => i !== lastBotIdx);
      }
      return prev;
    });
    sendMessage(originalContent, voiceTriggered.current);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input, false);
  };

  const handleSuggestionClick = (question: string) => {
    sendMessage(question, false);
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-10rem)] sm:max-h-[calc(100vh-12rem)]">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 animate-fade-in">
            {/* Welcome Graphic */}
            <div className="relative mb-6">
              <div
                className="absolute inset-0 blur-2xl opacity-20 rounded-full"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-violet), var(--color-indigo))",
                }}
              />
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center relative shadow-xl transform -rotate-6"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-surface), var(--color-border))",
                  border: "1px solid rgba(124, 92, 252, 0.2)",
                }}
              >
                <span className="text-3xl">✨</span>
              </div>
            </div>

            <h3 className="text-xl font-bold mb-2">Hey, I'm Jr. Talha!</h3>
            <p className="text-slate-400 text-sm mb-8 max-w-[280px]">
              I know pretty much everything about Talha's work. What do you want
              to know?
            </p>

            {/* Suggested Questions */}
            <div className="flex flex-col w-full max-w-sm gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestionClick(q)}
                  className="px-4 py-3 text-sm text-left bg-[var(--color-surface)] hover:bg-[var(--color-border)] border border-[var(--color-border)] rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 group"
                >
                  <span className="group-hover:text-white text-slate-300 transition-colors">
                    {q}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isBot = msg.role === "bot";
          // Empty bot messages should not render bubbles at all (double UI fix)
          if (isBot && !msg.content && msg.isStreaming) return null;

          return (
            <div
              key={msg.id}
              className={`flex w-full ${isBot ? "justify-start" : "justify-end"} animate-slide-up`}
            >
              <div
                className={`flex max-w-[85%] sm:max-w-[75%] ${isBot ? "flex-col" : "flex-row-reverse"}`}
              >
                {/* Bot Avatar */}
                {isBot && (
                  <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-slate-300">
                    <span
                      style={{
                        background:
                          "linear-gradient(135deg, var(--color-violet), var(--color-indigo))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      Jr. Talha
                    </span>
                    {voiceStatus === "speaking" && i === messages.length - 1 && (
                      <div className="flex items-end h-3 gap-[2px]">
                        <div className="equalizer-bar" />
                        <div className="equalizer-bar" />
                        <div className="equalizer-bar" />
                      </div>
                    )}
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    isBot
                      ? "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-warm-white)] rounded-tl-sm shadow-sm"
                      : "text-white rounded-tr-sm shadow-md"
                  }`}
                  style={{
                    background: !isBot
                      ? "linear-gradient(135deg, var(--color-violet), var(--color-indigo))"
                      : undefined,
                  }}
                >
                  {msg.hasError ? (
                    <div className="flex flex-col gap-3">
                      <span className="text-red-400">
                        Oops! My circuits got a little tangled. Let's try that
                        again! 😵‍💫
                      </span>
                      <button
                        onClick={() => retryMessage(messages[i - 1]?.content || "")}
                        className="self-start text-xs font-medium px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : (
                    <>
                      {msg.content}
                      {msg.isStreaming && <span className="streaming-cursor" />}
                    </>
                  )}
                </div>

                {/* Bot Metadata (Sources) */}
                {isBot && !msg.isStreaming && !msg.hasError && (
                  <div className="mt-2 pl-2">
                    {msg.isGrounded ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-medium">
                          <svg
                            className="w-3 h-3 inline mr-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          Based on:
                        </span>
                        {msg.sources?.map((source) => (
                          <span
                            key={source}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-midnight)] border border-[var(--color-border)] text-slate-400"
                          >
                            {source}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">
                        General knowledge (not verified against Talha's DB)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && (
            <div className="flex justify-start animate-fade-in">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-slate-300">
                  <span
                    style={{
                      background:
                        "linear-gradient(135deg, var(--color-violet), var(--color-indigo))",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    Jr. Talha
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[var(--color-violet)] animate-bounce [animation-delay:0ms]" />
                  <div className="w-2 h-2 rounded-full bg-[var(--color-indigo)] animate-bounce [animation-delay:150ms]" />
                  <div className="w-2 h-2 rounded-full bg-[var(--color-violet)] animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        {micError && (
          <div className="mb-2 text-xs text-red-400 text-center bg-red-400/10 py-1.5 rounded-lg border border-red-400/20">
            {micError}
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className={`relative flex items-center gap-2 bg-[var(--color-surface)] border rounded-2xl px-4 py-2 transition-colors duration-200 ${
            voiceStatus === "listening" ? "border-[var(--color-violet)]" : "border-[var(--color-border)] focus-within:border-[var(--color-violet)]"
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              voiceStatus === "listening" ? "Listening..." : "Ask me about Talha…"
            }
            disabled={isLoading || voiceStatus === "listening" || voiceStatus === "transcribing"}
            className="flex-1 bg-transparent text-[var(--color-warm-white)] text-sm placeholder-slate-500 focus:outline-none disabled:opacity-50 py-2"
          />
          
          {/* Mute TTS Button */}
          <button
            type="button"
            onClick={() => {
              const newMuted = !isSpeakerMuted;
              setIsSpeakerMuted(newMuted);
              isSpeakerMutedRef.current = newMuted;
              if (newMuted && currentAudioRef.current) {
                currentAudioRef.current.pause();
                currentAudioRef.current = null;
                ttsQueueRef.current = [];
                ttsPlayingRef.current = false;
                if (voiceStatus === "speaking") setVoiceStatus("idle");
              }
            }}
            className="p-1.5 text-slate-400 hover:text-white transition-colors flex-shrink-0 focus:outline-none"
            title={isSpeakerMuted ? "Unmute spoken responses" : "Mute spoken responses"}
          >
            {isSpeakerMuted ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
          
          {/* Mic Button */}
          <button
            type="button"
            onClick={() => {
              if (voiceStatus === "idle") startRecording();
              else if (voiceStatus === "listening") stopRecording();
            }}
            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200 cursor-pointer focus:outline-none ${
              voiceStatus === "listening" 
                ? "bg-red-500 text-white mic-listening" 
                : "bg-transparent text-slate-400 hover:text-white"
            }`}
            disabled={(isLoading && voiceStatus !== "listening") || voiceStatus === "transcribing"}
          >
            {voiceStatus === "transcribing" ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer focus:outline-none"
            style={{
              background:
                "linear-gradient(135deg, var(--color-violet), var(--color-indigo))",
            }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19V5m-7 7l7-7 7 7"
              />
            </svg>
          </button>
        </form>
        <p className="text-center text-xs text-slate-600 mt-2">
          🔒 I only share verified info about Talha — no hallucinations here!
        </p>
      </div>
    </div>
  );
}
