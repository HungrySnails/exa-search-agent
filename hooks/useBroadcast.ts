import { useEffect, useRef, useState } from "react";
import { splitIntoSegments, stripLinksForSpeech } from "@/lib/speech/segment";

export type TtsEngine = "browser" | "gemini";

// Gemini segments fetched at once, and the waits before retrying a dropped connection.
const MAX_SEGMENTS_IN_FLIGHT = 2;
const SPEECH_RETRY_DELAYS_MS = [2000, 4000];

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Avoid unhandled-rejection noise if it fails before it is awaited.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

/**
 * Dual-engine (browser SpeechSynthesis / Gemini TTS) playback state machine,
 * shared by Search mode (news overview + summaries) and Agent mode (report
 * text). The caller supplies the raw text to speak at call time (`toggle`),
 * so there is no stale-closure concern between renders.
 *
 * `resetKey` stops any in-progress playback and clears the segment cache
 * whenever it changes (e.g. a new search result arrives).
 */
export function useBroadcast({
  password,
  resetKey,
}: {
  password: string | null;
  resetKey: unknown;
}) {
  // A reading session is active (playing or paused).
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // The last reading ran to the end; the button then offers a replay.
  const [playbackDone, setPlaybackDone] = useState(false);
  // Whether a replay would be served entirely from the audio cache.
  const [replayFromCache, setReplayFromCache] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>("browser");
  const [ttsError, setTtsError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlsRef = useRef<string[]>([]);
  // Bumped on every stop so an in-flight Gemini queue knows it is stale.
  const geminiSessionRef = useRef(0);
  // Resolves the segment currently playing, so a stop can end the queue.
  const playbackEndRef = useRef<(() => void) | null>(null);
  // Generated Gemini audio keyed by segment text, so replaying costs no API calls.
  const segmentCacheRef = useRef(new Map<string, Blob>());
  // Cancels in-flight Gemini requests when playback stops.
  const abortRef = useRef<AbortController | null>(null);
  // Gemini queue waits here while paused; resume calls it to continue.
  const pausedRef = useRef(false);
  const resumeWakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  function stopPlaybackSources() {
    geminiSessionRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      // cancel() does not always clear a paused state in every browser.
      window.speechSynthesis.resume();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    pausedRef.current = false;
    resumeWakeRef.current?.();
    resumeWakeRef.current = null;
    playbackEndRef.current?.();
    playbackEndRef.current = null;
    audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioUrlsRef.current = [];
  }

  // Stops and rewinds; the next start begins from the top.
  function stop() {
    stopPlaybackSources();
    setIsSpeaking(false);
    setIsPaused(false);
    setPlaybackDone(false);
    setIsSynthesizing(false);
  }

  // Pauses in place; resume() continues from the same position.
  function pause() {
    if (ttsEngine === "browser") {
      window.speechSynthesis.pause();
    } else {
      pausedRef.current = true;
      audioRef.current?.pause();
    }
    setIsPaused(true);
  }

  function resume() {
    if (ttsEngine === "browser") {
      window.speechSynthesis.resume();
    } else {
      pausedRef.current = false;
      resumeWakeRef.current?.();
      resumeWakeRef.current = null;
      const audio = audioRef.current;
      // An ended segment must not restart; the queue will load the next one.
      if (audio && audio.src && !audio.ended) {
        audio.play().catch(() => {});
      }
    }
    setIsPaused(false);
  }

  useEffect(() => {
    return () => {
      stopPlaybackSources();
    };
  }, []);

  useEffect(() => {
    // New result fetched while a previous reading was in progress; stop it
    // so stale audio doesn't play over new text (deferred to satisfy the
    // no-sync-setState-in-effect rule).
    stopPlaybackSources();
    segmentCacheRef.current.clear();
    const timer = setTimeout(() => {
      setIsSpeaking(false);
      setIsPaused(false);
      setPlaybackDone(false);
      setReplayFromCache(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [resetKey]);

  // Checks the cache against the segments a replay of `text` would read.
  function refreshReplayCache(text: string) {
    const cache = segmentCacheRef.current;
    const segments = splitIntoSegments(stripLinksForSpeech(text));
    setReplayFromCache(segments.every((seg) => cache.has(seg)));
  }

  function speakWithBrowser(text: string) {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(stripLinksForSpeech(text));
    utterance.lang = "ja-JP";
    utterance.rate = 1.25;
    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setPlaybackDone(true);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };
    synth.cancel();
    synth.speak(utterance);
    setIsPaused(false);
    setPlaybackDone(false);
    setIsSpeaking(true);
  }

  async function fetchSpeech(text: string, appPassword: string, signal?: AbortSignal) {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-password": appPassword,
      },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "音声生成に失敗しました");
    }
    return res.blob();
  }

  // Retries only network failures (fetch rejects, e.g. a dropped connection),
  // not errors the server returned.
  async function fetchSpeechWithRetry(text: string, appPassword: string, signal: AbortSignal) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchSpeech(text, appPassword, signal);
      } catch (err) {
        const retryable =
          err instanceof TypeError && !signal.aborted && attempt < SPEECH_RETRY_DELAYS_MS.length;
        if (!retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, SPEECH_RETRY_DELAYS_MS[attempt]));
        if (signal.aborted) throw err;
      }
    }
  }

  // Plays one audio segment; resolves when it ends or is stopped.
  function playSegment(url: string) {
    return new Promise<void>((resolve, reject) => {
      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      playbackEndRef.current = resolve;
      audio.onended = () => {
        playbackEndRef.current = null;
        resolve();
      };
      audio.onerror = () => {
        playbackEndRef.current = null;
        reject(new Error("音声の再生に失敗しました"));
      };
      audio.src = url;
      audio.playbackRate = 1.1;
      audio.play().then(
        () => setIsSpeaking(true),
        (err) => {
          playbackEndRef.current = null;
          reject(err);
        }
      );
    });
  }

  // Starts playing as soon as the first segment is generated. The rest are
  // fetched in the background, all of them, with at most two requests in
  // flight, so a weak connection later in the reading does not stop it.
  async function speakWithGemini(text: string) {
    if (!password) return;
    stopPlaybackSources();
    const session = geminiSessionRef.current;
    const isCurrent = () => session === geminiSessionRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setTtsError(null);
    setIsPaused(false);
    setPlaybackDone(false);
    setIsSynthesizing(true);

    const segments = splitIntoSegments(stripLinksForSpeech(text));
    const cache = segmentCacheRef.current;
    const requests = segments.map(() => createDeferred<Blob>());
    let nextIndex = 0;
    let inFlight = 0;
    let failed = false;
    const requestSegment = (segText: string) => {
      const cached = cache.get(segText);
      if (cached) return Promise.resolve(cached);
      return fetchSpeechWithRetry(segText, password, controller.signal).then((blob) => {
        // Skip caching if this playback was stopped or the source text changed.
        if (isCurrent()) cache.set(segText, blob);
        return blob;
      });
    };
    const pump = () => {
      while (!failed && inFlight < MAX_SEGMENTS_IN_FLIGHT && nextIndex < segments.length) {
        const i = nextIndex++;
        inFlight++;
        requestSegment(segments[i])
          .then(
            (blob) => requests[i].resolve(blob),
            (err) => {
              failed = true;
              requests[i].reject(err);
            }
          )
          .finally(() => {
            inFlight--;
            pump();
          });
      }
    };
    pump();

    try {
      for (let i = 0; i < segments.length; i++) {
        const blob = await requests[i].promise;
        if (!isCurrent()) return;
        // Hold here while paused; resume() wakes the queue.
        if (pausedRef.current) {
          await new Promise<void>((resolve) => {
            resumeWakeRef.current = resolve;
          });
          if (!isCurrent()) return;
        }
        const url = URL.createObjectURL(blob);
        audioUrlsRef.current.push(url);
        if (i === 0) setIsSynthesizing(false);
        await playSegment(url);
        if (!isCurrent()) return;
      }
      setIsSpeaking(false);
      setIsPaused(false);
      setPlaybackDone(true);
      refreshReplayCache(text);
    } catch (err) {
      if (isCurrent()) {
        const message = err instanceof Error ? err.message : "音声生成に失敗しました";
        if (ttsSupported) {
          // Gemini TTS is unavailable (e.g. quota exhausted); fall back to
          // the browser's own speech synthesis rather than just erroring out.
          setTtsError(`${message}（ブラウザの読み上げに切り替えました）`);
          setTtsEngine("browser");
          speakWithBrowser(text);
        } else {
          setTtsError(message);
          setIsSpeaking(false);
          setIsPaused(false);
        }
      }
    } finally {
      if (isCurrent()) setIsSynthesizing(false);
    }
  }

  // Main button: pause/resume while a reading is active, otherwise start
  // reading `text` (computed by the caller at click time).
  function toggle(text: string) {
    if (!text) return;
    if (isSpeaking) {
      if (isPaused) resume();
      else pause();
      return;
    }
    setTtsError(null);
    if (ttsEngine === "browser") {
      if (!ttsSupported) return;
      speakWithBrowser(text);
    } else {
      speakWithGemini(text);
    }
  }

  function changeEngine(engine: TtsEngine) {
    if (isSpeaking) stop();
    setTtsError(null);
    setTtsEngine(engine);
  }

  return {
    isSpeaking,
    isPaused,
    playbackDone,
    replayFromCache,
    isSynthesizing,
    ttsSupported,
    ttsEngine,
    ttsError,
    toggle,
    stop,
    changeEngine,
    refreshReplayCache,
  };
}
