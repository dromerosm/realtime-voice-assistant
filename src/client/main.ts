import "./styles.css";

type AppStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

type TokenResponse = {
  value: string;
  expires_at?: number;
  session?: {
    id?: string;
    model?: string;
    voice?: string;
  };
  bootstrapUserMessage?: string | null;
};

type AppConfig = {
  authEnabled: boolean;
  appAuthenticated: boolean;
  tokenEndpoint: string;
  tokenMethod: "POST";
  turnstileSiteKey: string | null;
  memoryEnabled: boolean;
  memoryResetAvailable: boolean;
  adminAuthenticated: boolean;
};

type ApiErrorResponse = {
  error?: string;
  authRequired?: boolean;
};

type PersistedMemory = {
  kind: "name" | "preference" | "profile_fact" | "relationship";
  key: string;
  value: string;
  summary: string;
  confidence: number;
  last_seen_at: string;
};

type MemoryViewResponse = {
  enabled: boolean;
  memories: PersistedMemory[];
};

type MemoryBootstrapResponse = {
  enabled: boolean;
  bootstrapUserMessage: string | null;
};

type WebSearchFreshness = "auto" | "recent" | "today" | "general";

type WebSearchResult = {
  query: string;
  freshness: WebSearchFreshness;
  answer: string;
  bullets: string[];
  sources: Array<{
    title: string;
    url: string;
  }>;
  checked_at: string;
  cached: boolean;
};

type RealtimeResponseMetadata = Record<string, string>;

type RealtimeOutputItem = {
  id?: string;
  type?: string;
  status?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: Array<{ transcript?: string; text?: string }>;
};

type RealtimeEvent = {
  type: string;
  item_id?: string;
  session?: { id?: string };
  response?: {
    id?: string;
    metadata?: RealtimeResponseMetadata;
    output?: RealtimeOutputItem[];
    usage?: {
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  delta?: string;
  transcript?: string;
};

type RealtimeClientEvent =
  | {
      type: "conversation.item.create";
      item: {
        type: "message";
        role: "user";
        content: Array<{
          type: "input_text";
          text: string;
        }>;
      };
    }
  | {
      type: "conversation.item.create";
      item: {
        type: "function_call_output";
        call_id: string;
        output: string;
      };
    }
  | {
      type: "response.create";
      response?: {
        conversation?: "none";
        instructions?: string;
        input?: Array<{
          type: "message";
          role: "user";
          content: Array<{
            type: "input_text";
            text: string;
          }>;
        }>;
        max_output_tokens?: number;
        metadata?: RealtimeResponseMetadata;
        output_modalities?: string[];
      };
    };

type TranscriptRole = "user" | "assistant";

type TranscriptEntry = {
  id: string;
  role: TranscriptRole;
  text: string;
  pending: boolean;
};

type ActiveWebSearch = {
  callId: string;
  query: string;
  startedAt: number;
};

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark";
    }
  ) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const loginGate = document.querySelector<HTMLElement>("#loginGate");
const appShell = document.querySelector<HTMLElement>("#appShell");
const loginForm = document.querySelector<HTMLFormElement>("#loginForm");
const loginPasswordInput = document.querySelector<HTMLInputElement>("#loginPasswordInput");
const loginSubmitButton = document.querySelector<HTMLButtonElement>("#loginSubmitButton");
const loginStatus = document.querySelector<HTMLElement>("#loginStatus");
const connectButton = document.querySelector<HTMLButtonElement>("#connectButton");
const hangupButton = document.querySelector<HTMLButtonElement>("#hangupButton");
const logoutButton = document.querySelector<HTMLButtonElement>("#logoutButton");
const adminButton = document.querySelector<HTMLButtonElement>("#adminButton");
const resetMemoryButton = document.querySelector<HTMLButtonElement>("#resetMemoryButton");
const statusValue = document.querySelector<HTMLElement>("#statusValue");
const sessionValue = document.querySelector<HTMLElement>("#sessionValue");
const usageValue = document.querySelector<HTMLElement>("#usageValue");
const ambientCanvas = document.querySelector<HTMLCanvasElement>("#ambientCanvas");
const ambientModeBadge = document.querySelector<HTMLElement>("#ambientModeBadge");
const webSearchPanel = document.querySelector<HTMLElement>("#webSearchPanel");
const webSearchStatus = document.querySelector<HTMLElement>("#webSearchStatus");
const webSearchElapsed = document.querySelector<HTMLElement>("#webSearchElapsed");
const webSearchQuery = document.querySelector<HTMLElement>("#webSearchQuery");
const memoryPanel = document.querySelector<HTMLElement>("#memoryPanel");
const memoryList = document.querySelector<HTMLOListElement>("#memoryList");
const transcriptList = document.querySelector<HTMLOListElement>("#transcriptList");
const adminDialog = document.querySelector<HTMLDialogElement>("#adminDialog");
const adminDialogForm = document.querySelector<HTMLFormElement>("#adminDialogForm");
const adminTokenInput = document.querySelector<HTMLInputElement>("#adminTokenInput");
const adminDialogCancel = document.querySelector<HTMLButtonElement>("#adminDialogCancel");

if (
  !loginGate ||
  !appShell ||
  !loginForm ||
  !loginPasswordInput ||
  !loginSubmitButton ||
  !loginStatus ||
  !connectButton ||
  !hangupButton ||
  !logoutButton ||
  !adminButton ||
  !resetMemoryButton ||
  !statusValue ||
  !sessionValue ||
  !usageValue ||
  !ambientCanvas ||
  !ambientModeBadge ||
  !webSearchPanel ||
  !webSearchStatus ||
  !webSearchElapsed ||
  !webSearchQuery ||
  !memoryPanel ||
  !memoryList ||
  !transcriptList ||
  !adminDialog ||
  !adminDialogForm ||
  !adminTokenInput ||
  !adminDialogCancel
) {
  throw new Error("App shell is missing required DOM elements.");
}

class AmbientVoiceScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private rafId = 0;
  private lastTs = 0;
  private phase = 0;
  private energy = 0.12;
  private energyTarget = 0.12;
  private swirl = 0.18;
  private textImpulse = 0;
  private mode: AppStatus = "idle";
  private visualMode: AppStatus = "idle";
  private audioLevel = 0;
  private lastAudioActivityAt = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly badge: HTMLElement
  ) {
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Ambient canvas 2D context is unavailable.");
    }

    this.ctx = context;
    this.updateBadge(this.visualMode);
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  start() {
    if (this.rafId !== 0) {
      return;
    }

    this.rafId = window.requestAnimationFrame(this.frame);
  }

  setMode(mode: AppStatus) {
    this.mode = mode;
    this.energyTarget =
      mode === "speaking"
        ? Math.max(this.energyTarget, 0.58)
        : mode === "listening"
          ? 0.2
          : mode === "connecting"
            ? 0.3
            : mode === "error"
            ? 0.16
              : 0.12;
    this.updateBadge(mode);
  }

  pulseFromText(text: string) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const chars = text.trim().length;
    const amount = Math.min(0.42, words * 0.055 + chars * 0.0035);
    this.textImpulse = Math.min(1.4, this.textImpulse + amount);
    this.energyTarget = Math.min(1.1, this.energyTarget + amount * 0.75);
  }

  setAudioLevel(level: number) {
    const nextLevel = Math.max(0, Math.min(1, level));
    this.audioLevel = this.audioLevel * 0.68 + nextLevel * 0.32;
    if (this.audioLevel > 0.045) {
      this.lastAudioActivityAt = performance.now();
    }
  }

  private readonly resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw(0);
  };

  private readonly frame = (timestamp: number) => {
    if (this.lastTs === 0) {
      this.lastTs = timestamp;
    }

    const deltaSeconds = Math.min(0.05, (timestamp - this.lastTs) / 1000);
    this.lastTs = timestamp;

    const audioActive =
      this.audioLevel > 0.035 || timestamp - this.lastAudioActivityAt < 240;
    const visualMode =
      this.mode === "error" || this.mode === "connecting" || this.mode === "idle"
        ? this.mode
        : this.mode === "speaking" || audioActive
          ? "speaking"
          : this.mode;

    if (visualMode !== this.visualMode) {
      this.visualMode = visualMode;
      this.updateBadge(visualMode);
    }

    const baseSpeed =
      visualMode === "speaking"
        ? 0.95
        : visualMode === "listening"
          ? 0.2
          : visualMode === "connecting"
            ? 0.38
            : visualMode === "error"
              ? 0.12
              : 0.1;

    this.phase +=
      deltaSeconds *
      (baseSpeed + this.energy * 1.35 + this.textImpulse * 0.5 + this.audioLevel * 0.7);
    this.energy += (this.energyTarget - this.energy) * Math.min(1, deltaSeconds * 3.2);
    this.energyTarget = Math.max(
      visualMode === "speaking" ? 0.44 + this.audioLevel * 0.24 : visualMode === "listening" ? 0.16 : 0.1,
      this.energyTarget - deltaSeconds * (visualMode === "speaking" ? 0.15 : 0.09)
    );
    this.textImpulse = Math.max(0, this.textImpulse - deltaSeconds * 0.65);
    this.audioLevel = Math.max(0, this.audioLevel - deltaSeconds * 0.55);
    this.swirl += deltaSeconds * (0.08 + this.energy * 0.45);

    this.draw(deltaSeconds);
    this.rafId = window.requestAnimationFrame(this.frame);
  };

  private draw(deltaSeconds: number) {
    const { ctx, width, height } = this;
    const midX = width / 2;
    const midY = height / 2;
    const radius = Math.min(width, height) * 0.34;
    const accent = this.visualMode === "error" ? "255, 92, 92" : "93, 205, 255";
    const accentSoft = this.visualMode === "error" ? "255, 140, 120" : "82, 132, 255";

    ctx.clearRect(0, 0, width, height);

    const backdrop = ctx.createLinearGradient(0, 0, 0, height);
    backdrop.addColorStop(0, "rgba(3, 10, 18, 0.98)");
    backdrop.addColorStop(1, "rgba(7, 20, 35, 0.99)");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);

    const bloom = ctx.createRadialGradient(midX, midY, 0, midX, midY, radius * 1.7);
    bloom.addColorStop(0, `rgba(${accent}, ${0.16 + this.energy * 0.2})`);
    bloom.addColorStop(0.42, `rgba(${accentSoft}, ${0.08 + this.energy * 0.14})`);
    bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = `rgba(${accent}, 0.08)`;
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(midX, midY);

    const sweepAngle = this.phase * 1.65;
    const sweep = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.15);
    sweep.addColorStop(0, `rgba(${accent}, ${0.08 + this.energy * 0.14})`);
    sweep.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = sweep;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius * 1.15, sweepAngle - 0.24, sweepAngle + 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(${accent}, 0.2)`;
    ctx.lineWidth = 1;
    for (const ringRatio of [0.34, 0.52, 0.7, 0.88, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * ringRatio, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = `rgba(${accent}, 0.18)`;
    for (let spoke = 0; spoke < 12; spoke += 1) {
      const angle = (Math.PI * 2 * spoke) / 12 + this.phase * 0.03;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.16, Math.sin(angle) * radius * 0.16);
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      ctx.stroke();
    }

    ctx.save();
    ctx.rotate(-this.phase * (this.visualMode === "speaking" ? 0.44 : 0.16));
    ctx.strokeStyle = `rgba(${accent}, ${0.42 + this.energy * 0.22})`;
    ctx.lineWidth = 3;
    for (let segment = 0; segment < 5; segment += 1) {
      const offset = segment * 1.16;
      const arcStart = offset + this.textImpulse * 0.08;
      const arcEnd = arcStart + 0.36 + this.energy * 0.28;
      ctx.beginPath();
      ctx.arc(0, 0, radius * (0.42 + segment * 0.11), arcStart, arcEnd);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.rotate(this.phase * 0.8);
    ctx.strokeStyle = `rgba(${accentSoft}, ${0.24 + this.audioLevel * 0.34})`;
    ctx.lineWidth = 2;
    for (let segment = 0; segment < 4; segment += 1) {
      const start = segment * (Math.PI / 2) + this.swirl * 0.15;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.78, start, start + 0.22 + this.audioLevel * 0.16);
      ctx.stroke();
    }
    ctx.restore();

    const pulseRadius = radius * (0.16 + this.energy * 0.12 + this.audioLevel * 0.08);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, pulseRadius * 2.8);
    core.addColorStop(0, `rgba(${accent}, ${0.44 + this.energy * 0.26})`);
    core.addColorStop(0.45, `rgba(${accentSoft}, ${0.18 + this.audioLevel * 0.18})`);
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, pulseRadius * 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(222, 245, 255, ${0.65 + this.audioLevel * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();

    const bars = 24;
    for (let index = 0; index < bars; index += 1) {
      const ratio = index / bars;
      const angle = ratio * Math.PI * 2 + this.phase * 0.2;
      const activity =
        0.28 +
        this.energy * 0.5 +
        this.audioLevel * 0.7 +
        Math.sin(this.phase * 3 + index * 0.9) * 0.16;
      const inner = radius * 1.02;
      const outer = inner + Math.max(8, 18 * activity + this.textImpulse * 10);

      ctx.strokeStyle = `rgba(${accent}, ${0.22 + activity * 0.32})`;
      ctx.lineWidth = index % 3 === 0 ? 2.2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }

    ctx.restore();

    ctx.strokeStyle = `rgba(${accent}, ${0.12 + this.energy * 0.12})`;
    ctx.lineWidth = 1;
    const scanY = ((this.phase * 120) % (height + 80)) - 40;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(width, scanY);
    ctx.stroke();

    if (deltaSeconds === 0) {
      return;
    }
  }

  private updateBadge(mode: AppStatus) {
    this.badge.textContent =
      mode === "speaking"
        ? "hablando"
        : mode === "listening"
          ? "escuchando"
          : mode === "connecting"
            ? "conectando"
            : mode === "error"
              ? "error"
              : "idle";
  }
}

let peerConnection: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;
let localStream: MediaStream | null = null;
let remoteAudio: HTMLAudioElement | null = null;
let remoteAudioContext: AudioContext | null = null;
let remoteAnalyser: AnalyserNode | null = null;
let remoteAnalyserData: Uint8Array<ArrayBuffer> | null = null;
let remoteAudioSource: MediaStreamAudioSourceNode | null = null;
let remoteAudioMeterFrame: number | null = null;
let currentSessionId = "sin conexión";
let status: AppStatus = "idle";
const transcriptEntries = new Map<string, TranscriptEntry>();
const assistantMessageOrder = new Map<string, string>();
let appConfig: AppConfig | null = null;
let turnstileToken = "";
let turnstileWidgetId = "";
let memoryRefreshTimer: number | null = null;
let scheduledMemoryRefresh: number | null = null;
const memoryEntries: PersistedMemory[] = [];
const pendingToolCallIds = new Set<string>();
const toolWaitEntryIds = new Map<string, string>();
const activeWebSearches = new Map<string, ActiveWebSearch>();
let webSearchTicker: number | null = null;
const ambientScene = new AmbientVoiceScene(ambientCanvas, ambientModeBadge);
const WEB_SEARCH_RESPONSE_INSTRUCTIONS =
  'Responde en espanol. Empieza exactamente con "Un momento, lo compruebo en la web." y, a continuacion, da la respuesta final usando el resultado de la tool web_search. No digas que vas a comprobarlo mas tarde ni menciones detalles internos de tools.';

const isAppAccessGranted = () => !appConfig?.authEnabled || Boolean(appConfig?.appAuthenticated);

const setLoginMessage = (message: string, state: "info" | "error" = "info") => {
  loginStatus.textContent = message;
  loginStatus.dataset.state = state;
};

const syncAppAccessUi = () => {
  const accessGranted = isAppAccessGranted();
  loginGate.hidden = accessGranted;
  appShell.hidden = !accessGranted;
  logoutButton.hidden = !appConfig?.authEnabled || !accessGranted;
  logoutButton.disabled = !appConfig?.authEnabled || !accessGranted;

  if (!accessGranted) {
    setLoginMessage("Introduce la contraseña para abrir la app.");
    window.setTimeout(() => {
      loginPasswordInput.focus();
    }, 0);
  } else {
    setLoginMessage("Sesión validada.");
  }
};

const readErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    return payload.error || fallback;
  } catch {
    return fallback;
  }
};

const stopRemoteAudioMeter = () => {
  if (remoteAudioMeterFrame !== null) {
    window.cancelAnimationFrame(remoteAudioMeterFrame);
    remoteAudioMeterFrame = null;
  }

  remoteAudioSource?.disconnect();
  remoteAnalyser?.disconnect();
  remoteAudioSource = null;
  remoteAnalyser = null;
  remoteAnalyserData = null;

  if (remoteAudioContext) {
    void remoteAudioContext.close().catch(() => {});
    remoteAudioContext = null;
  }

  ambientScene.setAudioLevel(0);
};

const startRemoteAudioMeter = async (stream: MediaStream) => {
  stopRemoteAudioMeter();

  if (typeof window.AudioContext === "undefined") {
    return;
  }

  try {
    remoteAudioContext = new window.AudioContext();
    if (remoteAudioContext.state === "suspended") {
      await remoteAudioContext.resume();
    }

    remoteAudioSource = remoteAudioContext.createMediaStreamSource(stream);
    remoteAnalyser = remoteAudioContext.createAnalyser();
    remoteAnalyser.fftSize = 512;
    remoteAnalyser.smoothingTimeConstant = 0.72;
    remoteAnalyserData = new Uint8Array(new ArrayBuffer(remoteAnalyser.frequencyBinCount));
    remoteAudioSource.connect(remoteAnalyser);

    const tick = () => {
      if (!remoteAnalyser || !remoteAnalyserData) {
        return;
      }

      remoteAnalyser.getByteFrequencyData(remoteAnalyserData);

      let sum = 0;
      const sampleCount = Math.min(remoteAnalyserData.length, 48);
      for (let index = 0; index < sampleCount; index += 1) {
        sum += remoteAnalyserData[index] ?? 0;
      }

      const average = sum / Math.max(1, sampleCount * 255);
      const normalized = Math.max(0, Math.min(1, (average - 0.02) * 5.5));
      ambientScene.setAudioLevel(normalized);

      remoteAudioMeterFrame = window.requestAnimationFrame(tick);
    };

    remoteAudioMeterFrame = window.requestAnimationFrame(tick);
  } catch (error) {
    console.warn("Remote audio meter could not start", error);
    stopRemoteAudioMeter();
  }
};

const sendRealtimeClientEvent = (event: RealtimeClientEvent) => {
  if (!dataChannel || dataChannel.readyState !== "open") {
    return false;
  }

  dataChannel.send(JSON.stringify(event));
  return true;
};

const sendBootstrapUserMessage = (text: string) => {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return;
  }

  sendRealtimeClientEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: trimmedText
        }
      ]
    }
  });
};

const removeTranscriptEntry = (id: string) => {
  if (!transcriptEntries.delete(id)) {
    return;
  }

  renderTranscript();
};

const formatElapsed = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)}s`;

const renderWebSearchStatus = () => {
  const activeSearch = [...activeWebSearches.values()].sort((a, b) => a.startedAt - b.startedAt)[0];

  if (!activeSearch) {
    webSearchPanel.hidden = true;
    webSearchStatus.textContent = "En espera";
    webSearchElapsed.textContent = "0.0s";
    webSearchQuery.textContent = "Sin consulta activa.";
    return;
  }

  webSearchPanel.hidden = false;
  webSearchStatus.textContent = "Consultando la web...";
  webSearchElapsed.textContent = formatElapsed(performance.now() - activeSearch.startedAt);
  webSearchQuery.textContent = activeSearch.query;
};

const syncWebSearchTicker = () => {
  if (activeWebSearches.size === 0) {
    if (webSearchTicker !== null) {
      window.clearInterval(webSearchTicker);
      webSearchTicker = null;
    }
    renderWebSearchStatus();
    return;
  }

  if (webSearchTicker === null) {
    webSearchTicker = window.setInterval(() => {
      renderWebSearchStatus();
    }, 100);
  }

  renderWebSearchStatus();
};

const startWebSearchStatus = (callId: string, query: string) => {
  activeWebSearches.set(callId, {
    callId,
    query,
    startedAt: performance.now()
  });
  syncWebSearchTicker();
};

const clearWebSearchStatus = (callId?: string) => {
  if (callId) {
    activeWebSearches.delete(callId);
  } else {
    activeWebSearches.clear();
  }

  syncWebSearchTicker();
};

const clearToolWaitFeedback = () => {
  if (toolWaitEntryIds.size === 0) {
    clearWebSearchStatus();
    return;
  }

  for (const entryId of toolWaitEntryIds.values()) {
    removeTranscriptEntry(entryId);
  }

  toolWaitEntryIds.clear();
  clearWebSearchStatus();
};

const startToolWaitFeedback = (callId: string) => {
  if (toolWaitEntryIds.has(callId)) {
    return;
  }

  const entryId = `tool-wait:${callId}`;
  toolWaitEntryIds.set(callId, entryId);
  upsertTranscriptEntry(entryId, "assistant", () => ({
    id: entryId,
    role: "assistant",
    text: "Consultando la web...",
    pending: true
  }));
  setStatus("speaking", "consultando web");
};

const normalizeWebSearchFreshness = (freshness: unknown): WebSearchFreshness => {
  switch (freshness) {
    case "recent":
    case "today":
    case "general":
      return freshness;
    default:
      return "auto";
  }
};

const parseWebSearchToolArguments = (value?: string) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      query?: unknown;
      freshness?: unknown;
    };
    const query = typeof parsed.query === "string" ? parsed.query.trim() : "";
    if (!query) {
      return null;
    }

    return {
      query,
      freshness: normalizeWebSearchFreshness(parsed.freshness)
    };
  } catch {
    return null;
  }
};

const executeWebSearch = async (query: string, freshness: WebSearchFreshness) => {
  const response = await fetch("/api/tools/web-search", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      freshness
    })
  });

  if (!response.ok) {
    throw new Error(`Web search request failed with status ${response.status}`);
  }

  return (await response.json()) as WebSearchResult;
};

const sendFunctionCallOutput = (callId: string, output: unknown) => {
  sendRealtimeClientEvent({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(output)
    }
  });
};

const handleWebSearchToolCall = async (outputItem: RealtimeOutputItem) => {
  const callId = outputItem.call_id?.trim();
  if (!callId || pendingToolCallIds.has(callId)) {
    return;
  }

  const args = parseWebSearchToolArguments(outputItem.arguments);
  pendingToolCallIds.add(callId);
  startToolWaitFeedback(callId);
  startWebSearchStatus(callId, args?.query ?? "Consulta web en preparación...");

  try {
    if (!args) {
      throw new Error("Invalid web_search arguments.");
    }

    const result = await executeWebSearch(args.query, args.freshness);
    sendFunctionCallOutput(callId, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo completar la búsqueda web.";
    sendFunctionCallOutput(callId, {
      ok: false,
      error: message
    });
  } finally {
    sendRealtimeClientEvent({
      type: "response.create",
      response: {
        instructions: WEB_SEARCH_RESPONSE_INSTRUCTIONS,
        output_modalities: ["audio"]
      }
    });
    pendingToolCallIds.delete(callId);
  }
};

const sendMemoryBootstrapRefresh = async (bootstrapUserMessage?: string | null) => {
  if (!peerConnection || !dataChannel || dataChannel.readyState !== "open") {
    return;
  }

  let nextMessage = bootstrapUserMessage;

  if (typeof nextMessage === "undefined") {
    try {
      const response = await fetch("/api/memory/bootstrap", {
        cache: "no-store",
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error(`Memory bootstrap request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as MemoryBootstrapResponse;
      nextMessage = payload.bootstrapUserMessage;
    } catch (error) {
      console.warn("Memory bootstrap refresh failed", error);
      return;
    }
  }

  if (!nextMessage) {
    return;
  }

  sendBootstrapUserMessage(nextMessage);
};

const setStatus = (nextStatus: AppStatus, message?: string) => {
  status = nextStatus;
  statusValue.textContent = message ? `${nextStatus} · ${message}` : nextStatus;
  ambientScene.setMode(nextStatus);
};

const setSession = (value: string) => {
  currentSessionId = value;
  sessionValue.textContent = value;
};

const setUsage = (value: string) => {
  usageValue.textContent = value;
};

const syncButtons = () => {
  const connected = Boolean(peerConnection);
  const accessGranted = isAppAccessGranted();
  connectButton.disabled = !accessGranted || connected || status === "connecting";
  hangupButton.disabled = !connected;
};

const syncMemoryControls = () => {
  const accessGranted = isAppAccessGranted();
  const memoryEnabled = appConfig?.memoryEnabled ?? false;
  const memoryResetAvailable = appConfig?.memoryResetAvailable ?? false;
  const adminAuthenticated = appConfig?.adminAuthenticated ?? false;

  adminButton.hidden = !accessGranted || !memoryEnabled || !memoryResetAvailable;
  adminButton.textContent = adminAuthenticated ? "Salir admin" : "Admin";

  resetMemoryButton.hidden =
    !accessGranted || !memoryEnabled || !memoryResetAvailable || !adminAuthenticated;
  resetMemoryButton.disabled =
    !accessGranted || !memoryEnabled || !memoryResetAvailable || !adminAuthenticated;
  memoryPanel.hidden = !accessGranted || !memoryEnabled;
};

const memoryKindLabel = (kind: PersistedMemory["kind"]) => {
  switch (kind) {
    case "name":
      return "Nombre";
    case "preference":
      return "Preferencia";
    case "relationship":
      return "Relacion";
    case "profile_fact":
      return "Hecho";
  }
};

const renderMemory = () => {
  memoryList.innerHTML = "";

  if (!appConfig?.memoryEnabled || memoryEntries.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-state";
    emptyItem.textContent = "Todavía no hay memoria persistente guardada.";
    memoryList.appendChild(emptyItem);
    return;
  }

  for (const memory of memoryEntries) {
    const item = document.createElement("li");
    item.className = "memory-item";

    const header = document.createElement("div");
    header.className = "memory-item-header";

    const label = document.createElement("span");
    label.className = "memory-kind";
    label.textContent = memoryKindLabel(memory.kind);

    const meta = document.createElement("div");
    meta.className = "memory-item-meta";

    const confidence = document.createElement("span");
    confidence.className = "memory-confidence";
    confidence.textContent = `${Math.round(memory.confidence * 100)}%`;

    meta.appendChild(confidence);

    if (appConfig?.adminAuthenticated) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "memory-delete-button";
      deleteButton.textContent = "Borrar";
      deleteButton.addEventListener("click", () => {
        void deletePersistentMemory(memory);
      });
      meta.appendChild(deleteButton);
    }

    header.append(label, meta);

    const body = document.createElement("p");
    body.className = "memory-summary";
    body.textContent = memory.summary || memory.value;

    item.append(header, body);
    memoryList.appendChild(item);
  }
};

const refreshMemory = async () => {
  if (!isAppAccessGranted() || !appConfig?.memoryEnabled) {
    memoryEntries.length = 0;
    renderMemory();
    return;
  }

  try {
    const response = await fetch("/api/memory", {
      cache: "no-store"
    });

    if (!response.ok) {
      if (response.status === 401) {
        await loadAppConfig();
        return;
      }
      throw new Error(`Memory request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as MemoryViewResponse;
    memoryEntries.length = 0;
    memoryEntries.push(...payload.memories);
    renderMemory();
  } catch (error) {
    console.warn("Memory refresh failed", error);
  }
};

const scheduleMemoryRefresh = (delayMs = 1_500) => {
  if (scheduledMemoryRefresh !== null) {
    window.clearTimeout(scheduledMemoryRefresh);
  }

  scheduledMemoryRefresh = window.setTimeout(() => {
    scheduledMemoryRefresh = null;
    void refreshMemory();
  }, delayMs);
};

const syncMemoryPolling = () => {
  if (memoryRefreshTimer !== null) {
    window.clearInterval(memoryRefreshTimer);
    memoryRefreshTimer = null;
  }

  if (!isAppAccessGranted() || !appConfig?.memoryEnabled) {
    return;
  }

  memoryRefreshTimer = window.setInterval(() => {
    void refreshMemory();
  }, 3_000);
};

const renderTranscript = () => {
  const entries = [...transcriptEntries.values()];
  transcriptList.innerHTML = "";

  if (entries.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-state";
    emptyItem.textContent = "Todavía no hay turnos.";
    transcriptList.appendChild(emptyItem);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `turn turn-${entry.role}`;

    const label = document.createElement("span");
    label.className = "turn-role";
    label.textContent = entry.role === "user" ? "Usuario" : "Asistente";

    const body = document.createElement("p");
    body.className = "turn-text";
    body.textContent =
      entry.text.trim() || (entry.pending ? "escuchando..." : "sin contenido");

    item.append(label, body);
    transcriptList.appendChild(item);
  }
};

const loadScript = async (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true
      });
      if (existing.dataset.loaded === "true") {
        resolve();
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
    document.head.appendChild(script);
  });

const ensureCaptchaUi = async () => {
  if (!isAppAccessGranted() || !appConfig?.turnstileSiteKey) {
    return;
  }

  let captchaPanel = document.querySelector<HTMLElement>("#captchaPanel");
  let captchaSlot = document.querySelector<HTMLElement>("#turnstileSlot");

  if (!captchaPanel || !captchaSlot) {
    captchaPanel = document.createElement("section");
    captchaPanel.id = "captchaPanel";
    captchaPanel.className = "panel captcha-panel";

    const title = document.createElement("h2");
    title.textContent = "Verificación humana";

    const copy = document.createElement("p");
    copy.textContent =
      "La publicación pública usa comprobación anti-bot antes de emitir tokens efímeros.";

    captchaSlot = document.createElement("div");
    captchaSlot.id = "turnstileSlot";

    captchaPanel.append(title, copy, captchaSlot);

    document.querySelector(".controls-panel")?.after(captchaPanel);
  }

  await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");

  if (!window.turnstile || !captchaSlot || turnstileWidgetId) {
    return;
  }

  turnstileWidgetId = window.turnstile.render(captchaSlot, {
    sitekey: appConfig.turnstileSiteKey,
    theme: "dark",
    callback: (token) => {
      turnstileToken = token;
    },
    "expired-callback": () => {
      turnstileToken = "";
    },
    "error-callback": () => {
      turnstileToken = "";
      setStatus("error", "captcha no disponible");
    }
  });
};

const upsertTranscriptEntry = (
  id: string,
  role: TranscriptRole,
  updater: (current: TranscriptEntry | undefined) => TranscriptEntry
) => {
  transcriptEntries.set(id, updater(transcriptEntries.get(id)));
  renderTranscript();
};

const resetState = () => {
  transcriptEntries.clear();
  assistantMessageOrder.clear();
  renderTranscript();
  setSession("sin conexión");
  setUsage("n/d");
  setStatus("idle");
};

const closeConnection = () => {
  clearToolWaitFeedback();
  clearWebSearchStatus();
  pendingToolCallIds.clear();
  dataChannel?.close();
  dataChannel = null;

  peerConnection?.close();
  peerConnection = null;

  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;

  if (remoteAudio) {
    remoteAudio.pause();
    remoteAudio.srcObject = null;
  }

  stopRemoteAudioMeter();

  resetState();
  syncButtons();
};

const loadAppConfig = async () => {
  const response = await fetch("/api/app-config", {
    cache: "no-store",
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw new Error(`Config request failed with status ${response.status}`);
  }

  appConfig = (await response.json()) as AppConfig;
  syncAppAccessUi();
  syncButtons();
  syncMemoryControls();
  renderMemory();
  if (isAppAccessGranted()) {
    void refreshMemory();
  } else {
    memoryEntries.length = 0;
    renderMemory();
  }
  syncMemoryPolling();
  if (isAppAccessGranted()) {
    await ensureCaptchaUi();
  }
};

const submitAppLogin = async () => {
  const password = loginPasswordInput.value;
  if (!password) {
    setLoginMessage("Introduce la contraseña de acceso.", "error");
    loginPasswordInput.focus();
    return;
  }

  loginSubmitButton.disabled = true;
  loginPasswordInput.disabled = true;
  setLoginMessage("Validando acceso...");

  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password
      })
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "No se pudo iniciar sesión."));
    }

    loginPasswordInput.value = "";
    await loadAppConfig();
    setStatus("idle");
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar sesión.";
    setLoginMessage(message, "error");
    loginPasswordInput.select();
  } finally {
    loginSubmitButton.disabled = false;
    loginPasswordInput.disabled = false;
  }
};

const logoutAppSession = async () => {
  closeConnection();

  try {
    const response = await fetch("/api/auth/session", {
      method: "DELETE",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "No se pudo cerrar la sesión."));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cerrar la sesión.";
    window.alert(message);
  } finally {
    await loadAppConfig();
  }
};

const requestAdminToken = async () =>
  new Promise<string | null>((resolve) => {
    adminTokenInput.value = "";

    const cleanup = () => {
      adminDialogForm.removeEventListener("submit", handleSubmit);
      adminDialogCancel.removeEventListener("click", handleCancel);
      adminDialog.removeEventListener("close", handleClose);
    };

    const handleSubmit = (event: SubmitEvent) => {
      event.preventDefault();
      const token = adminTokenInput.value.trim();
      cleanup();
      adminDialog.close();
      resolve(token || null);
    };

    const handleCancel = () => {
      cleanup();
      adminDialog.close();
      resolve(null);
    };

    const handleClose = () => {
      cleanup();
      resolve(null);
    };

    adminDialogForm.addEventListener("submit", handleSubmit, { once: true });
    adminDialogCancel.addEventListener("click", handleCancel, { once: true });
    adminDialog.addEventListener("close", handleClose, { once: true });
    adminDialog.showModal();
    adminTokenInput.focus();
  });

const sendMemoryIngest = async (itemId: string, transcript: string) => {
  if (!isAppAccessGranted() || !appConfig?.memoryEnabled) {
    return;
  }

  try {
    await fetch("/api/memory/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sessionId: currentSessionId === "sin conexión" ? "unknown-session" : currentSessionId,
        itemId,
        transcript
      }),
      keepalive: true
    });
    scheduleMemoryRefresh();
  } catch (error) {
    console.warn("Memory ingest request failed", error);
  }
};

const resetPersistentMemory = async () => {
  if (!appConfig?.memoryResetAvailable || !appConfig.adminAuthenticated) {
    return;
  }

  const confirmed = window.confirm(
    "Esto borrará la memoria persistente usada en sesiones futuras. ¿Continuar?"
  );
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch("/api/memory/reset", {
      method: "POST",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(`Reset request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      bootstrapUserMessage?: string | null;
    };

    memoryEntries.length = 0;
    renderMemory();
    await sendMemoryBootstrapRefresh(payload.bootstrapUserMessage ?? null);
    scheduleMemoryRefresh(250);
    window.alert("Memoria persistente borrada.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo borrar la memoria";
    window.alert(message);
  }
};

const deletePersistentMemory = async (memory: PersistedMemory) => {
  if (!appConfig?.memoryEnabled || !appConfig.adminAuthenticated) {
    return;
  }

  const confirmed = window.confirm(
    `Esto borrará la memoria "${memory.summary || memory.value}". ¿Continuar?`
  );
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch("/api/memory/delete", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        kind: memory.kind,
        key: memory.key
      })
    });

    if (!response.ok) {
      throw new Error(`Delete request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      deleted?: boolean;
      bootstrapUserMessage?: string | null;
    };

    if (!payload.deleted) {
      throw new Error("La entrada ya no existe o no se pudo borrar.");
    }

    const index = memoryEntries.findIndex(
      (entry) => entry.kind === memory.kind && entry.key === memory.key
    );
    if (index >= 0) {
      memoryEntries.splice(index, 1);
      renderMemory();
    }

    await sendMemoryBootstrapRefresh(payload.bootstrapUserMessage ?? null);
    scheduleMemoryRefresh(250);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo borrar la memoria";
    window.alert(message);
  }
};

const toggleAdminSession = async () => {
  if (!isAppAccessGranted() || !appConfig?.memoryResetAvailable) {
    return;
  }

  try {
    if (appConfig.adminAuthenticated) {
      const response = await fetch("/api/admin/session", {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!response.ok) {
        throw new Error(`Admin logout failed with status ${response.status}`);
      }
      appConfig.adminAuthenticated = false;
      syncMemoryControls();
      return;
    }

    const adminToken = await requestAdminToken();
    if (!adminToken) {
      return;
    }

    const response = await fetch("/api/admin/session", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        token: adminToken
      })
    });

    if (!response.ok) {
      throw new Error(`Admin login failed with status ${response.status}`);
    }

    appConfig.adminAuthenticated = true;
    syncMemoryControls();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cambiar la sesión admin";
    window.alert(message);
  }
};

const handleRealtimeEvent = (event: RealtimeEvent) => {
  switch (event.type) {
    case "session.created":
    case "session.updated": {
      if (event.session?.id) {
        setSession(event.session.id);
      }
      break;
    }
    case "input_audio_buffer.speech_started": {
      setStatus("listening", "detectando voz");
      break;
    }
    case "input_audio_buffer.speech_stopped": {
      setStatus("listening", "procesando turno");
      break;
    }
    case "conversation.item.input_audio_transcription.completed": {
      if (!event.item_id || !event.transcript) {
        break;
      }
      upsertTranscriptEntry(event.item_id, "user", (current) => ({
        id: event.item_id as string,
        role: "user",
        text: event.transcript ?? current?.text ?? "",
        pending: false
      }));
      void sendMemoryIngest(event.item_id, event.transcript);
      setStatus("listening", "turno usuario recibido");
      break;
    }
    case "response.created": {
      clearToolWaitFeedback();
      setStatus("speaking", "respondiendo");
      break;
    }
    case "response.output_item.added": {
      const outputItem = event.response?.output?.[0];
      if (!outputItem?.id || outputItem.type === "function_call") {
        break;
      }
      assistantMessageOrder.set(outputItem.id, outputItem.id);
      upsertTranscriptEntry(outputItem.id, "assistant", () => ({
        id: outputItem.id as string,
        role: "assistant",
        text: "",
        pending: true
      }));
      break;
    }
    case "response.output_audio_transcript.delta":
    case "response.output_text.delta": {
      const outputItem = event.response?.output?.[0];
      const entryId = outputItem?.id ?? [...assistantMessageOrder.keys()].at(-1);
      if (!entryId || !event.delta) {
        break;
      }
      ambientScene.pulseFromText(event.delta);
      upsertTranscriptEntry(entryId, "assistant", (current) => ({
        id: entryId,
        role: "assistant",
        text: `${current?.text ?? ""}${event.delta ?? ""}`,
        pending: true
      }));
      break;
    }
    case "response.output_audio_transcript.done":
    case "response.output_text.done": {
      const outputItem = event.response?.output?.[0];
      const entryId = outputItem?.id ?? [...assistantMessageOrder.keys()].at(-1);
      if (!entryId) {
        break;
      }

      const doneText =
        outputItem?.content?.map((part) => part.transcript ?? part.text ?? "").join("") ??
        transcriptEntries.get(entryId)?.text ??
        "";

      upsertTranscriptEntry(entryId, "assistant", () => ({
        id: entryId,
        role: "assistant",
        text: doneText,
        pending: false
      }));
      break;
    }
    case "response.done": {
      const usage = event.response?.usage;
      if (usage) {
        setUsage(
          `${usage.total_tokens ?? 0} total · in ${usage.input_tokens ?? 0} · out ${usage.output_tokens ?? 0}`
        );
      }

      const webSearchCall = event.response?.output?.find(
        (outputItem) =>
          outputItem.type === "function_call" && outputItem.name === "web_search"
      );

      if (webSearchCall) {
        void handleWebSearchToolCall(webSearchCall);
        break;
      }

      setStatus("listening", "esperando siguiente turno");
      break;
    }
    case "error": {
      setStatus("error", "evento realtime de error");
      break;
    }
    default:
      break;
  }
};

const connect = async () => {
  if (peerConnection) {
    return;
  }

  setStatus("connecting");
  syncButtons();

  try {
    if (!appConfig) {
      await loadAppConfig();
    }

    if (!isAppAccessGranted()) {
      throw new Error("Debes iniciar sesión antes de conectar.");
    }

    if (appConfig?.turnstileSiteKey && !turnstileToken) {
      throw new Error("Completa la verificación humana antes de conectar.");
    }

    const tokenResponse = await fetch(appConfig?.tokenEndpoint ?? "/api/realtime/token", {
      method: appConfig?.tokenMethod ?? "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        turnstileToken
      })
    });
    if (!tokenResponse.ok) {
      if (tokenResponse.status === 401) {
        await loadAppConfig();
        throw new Error(await readErrorMessage(tokenResponse, "Debes iniciar sesión otra vez."));
      }
      throw new Error(`Token request failed with status ${tokenResponse.status}`);
    }

    const tokenData = (await tokenResponse.json()) as TokenResponse;
    if (!tokenData.value) {
      throw new Error("Token endpoint did not return an ephemeral key.");
    }

    remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;

    const pc = new RTCPeerConnection();
    peerConnection = pc;

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setStatus("error", pc.connectionState);
      }
      if (pc.connectionState === "closed") {
        closeConnection();
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudio) {
        remoteAudio.srcObject = event.streams[0];
        void remoteAudio.play().catch(() => {});
      }
      void startRemoteAudioMeter(event.streams[0]);
    };

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }

    const channel = pc.createDataChannel("oai-events");
    dataChannel = channel;

    channel.addEventListener("open", () => {
      setStatus("listening", "conectado");
      if (tokenData.session?.id) {
        setSession(tokenData.session.id);
      }
      if (tokenData.bootstrapUserMessage) {
        sendBootstrapUserMessage(tokenData.bootstrapUserMessage);
      }
    });

    channel.addEventListener("message", (messageEvent) => {
      try {
        handleRealtimeEvent(JSON.parse(messageEvent.data) as RealtimeEvent);
      } catch {
        setStatus("error", "evento no parseable");
      }
    });

    channel.addEventListener("close", () => {
      if (status !== "idle") {
        setStatus("idle", "data channel cerrado");
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${tokenData.value}`,
        "Content-Type": "application/sdp"
      }
    });

    if (!sdpResponse.ok) {
      throw new Error(`Realtime call failed with status ${sdpResponse.status}`);
    }

    const answer = {
      type: "answer" as const,
      sdp: await sdpResponse.text()
    };

    await pc.setRemoteDescription(answer);

    if (turnstileWidgetId && window.turnstile) {
      turnstileToken = "";
      window.turnstile.reset(turnstileWidgetId);
    }

    syncButtons();
  } catch (error) {
    closeConnection();
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus("error", message);
    syncButtons();
  }
};

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitAppLogin();
});

connectButton.addEventListener("click", () => {
  void connect();
});

hangupButton.addEventListener("click", () => {
  closeConnection();
});

logoutButton.addEventListener("click", () => {
  void logoutAppSession();
});

adminButton.addEventListener("click", () => {
  void toggleAdminSession();
});

resetMemoryButton.addEventListener("click", () => {
  void resetPersistentMemory();
});

renderTranscript();
renderWebSearchStatus();
renderMemory();
syncButtons();
syncMemoryControls();
setSession(currentSessionId);
ambientScene.start();
void loadAppConfig().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "No se pudo cargar la configuración";
  setLoginMessage(message, "error");
  setStatus("error", message);
});
