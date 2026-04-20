import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export type AppRuntimeConfig = {
  server: {
    port: number;
    host: string;
  };
  realtime: {
    model: string;
    voice: string;
    transcriptionModel: string;
    instructions: string;
    clientSecretTtlSeconds: number;
    tokenRateLimitWindowMs: number;
    tokenRateLimitMaxRequests: number;
    allowedOrigins: string[];
  };
  proxy: {
    trustHeaders: boolean;
    ipHeader: "" | "cf-connecting-ip" | "x-real-ip" | "x-forwarded-for";
  };
  appLogin: {
    enabled: boolean;
    sessionTtlSeconds: number;
    rateLimitWindowMs: number;
    rateLimitMaxAttempts: number;
  };
  memory: {
    enabled: boolean;
    dbPath: string;
    model: string;
    queueConcurrency: number;
  };
  admin: {
    sessionTtlSeconds: number;
  };
  webSearch: {
    enabled: boolean;
    model: string;
    cacheTtlMs: number;
  };
  turnstile: {
    siteKey: string;
  };
};

const defaultConfig: AppRuntimeConfig = {
  server: {
    port: 3000,
    host: "0.0.0.0"
  },
  realtime: {
    model: "gpt-realtime-1.5",
    voice: "marin",
    transcriptionModel: "gpt-4o-mini-transcribe",
    instructions:
      "You are a concise real-time voice assistant. Keep answers short, natural, and conversational. Remember details shared by the user during the current session.",
    clientSecretTtlSeconds: 120,
    tokenRateLimitWindowMs: 60_000,
    tokenRateLimitMaxRequests: 5,
    allowedOrigins: ["http://localhost:3001", "http://127.0.0.1:3001"]
  },
  proxy: {
    trustHeaders: false,
    ipHeader: ""
  },
  appLogin: {
    enabled: false,
    sessionTtlSeconds: 43_200,
    rateLimitWindowMs: 900_000,
    rateLimitMaxAttempts: 5
  },
  memory: {
    enabled: true,
    dbPath: "./data/memory.sqlite",
    model: "gpt-5-mini",
    queueConcurrency: 1
  },
  admin: {
    sessionTtlSeconds: 43_200
  },
  webSearch: {
    enabled: true,
    model: "gpt-5-nano",
    cacheTtlMs: 300_000
  },
  turnstile: {
    siteKey: ""
  }
};

const moduleDir = fileURLToPath(new URL(".", import.meta.url));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const readBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const readNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const readStringArray = (value: unknown, fallback: string[]) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim())
    : fallback;

const resolveConfigPath = () => {
  const candidates = [
    join(process.cwd(), "app.config.json"),
    normalize(join(moduleDir, "..", "..", "app.config.json"))
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Missing app.config.json. Checked: ${candidates.join(", ")}`
  );
};

export const loadAppRuntimeConfig = (): AppRuntimeConfig => {
  const configPath = resolveConfigPath();
  const rawText = readFileSync(configPath, "utf8");
  const parsed = JSON.parse(rawText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error(`Invalid app.config.json at ${configPath}: expected top-level object.`);
  }

  const server = isRecord(parsed.server) ? parsed.server : {};
  const realtime = isRecord(parsed.realtime) ? parsed.realtime : {};
  const proxy = isRecord(parsed.proxy) ? parsed.proxy : {};
  const appLogin = isRecord(parsed.appLogin) ? parsed.appLogin : {};
  const memory = isRecord(parsed.memory) ? parsed.memory : {};
  const admin = isRecord(parsed.admin) ? parsed.admin : {};
  const webSearch = isRecord(parsed.webSearch) ? parsed.webSearch : {};
  const turnstile = isRecord(parsed.turnstile) ? parsed.turnstile : {};

  const ipHeader = readString(proxy.ipHeader, defaultConfig.proxy.ipHeader);
  const normalizedIpHeader =
    ipHeader === "cf-connecting-ip" || ipHeader === "x-real-ip" || ipHeader === "x-forwarded-for"
      ? ipHeader
      : "";

  return {
    server: {
      port: readNumber(server.port, defaultConfig.server.port),
      host: readString(server.host, defaultConfig.server.host)
    },
    realtime: {
      model: readString(realtime.model, defaultConfig.realtime.model),
      voice: readString(realtime.voice, defaultConfig.realtime.voice),
      transcriptionModel: readString(
        realtime.transcriptionModel,
        defaultConfig.realtime.transcriptionModel
      ),
      instructions: readString(realtime.instructions, defaultConfig.realtime.instructions),
      clientSecretTtlSeconds: readNumber(
        realtime.clientSecretTtlSeconds,
        defaultConfig.realtime.clientSecretTtlSeconds
      ),
      tokenRateLimitWindowMs: readNumber(
        realtime.tokenRateLimitWindowMs,
        defaultConfig.realtime.tokenRateLimitWindowMs
      ),
      tokenRateLimitMaxRequests: readNumber(
        realtime.tokenRateLimitMaxRequests,
        defaultConfig.realtime.tokenRateLimitMaxRequests
      ),
      allowedOrigins: readStringArray(
        realtime.allowedOrigins,
        defaultConfig.realtime.allowedOrigins
      ).filter(Boolean)
    },
    proxy: {
      trustHeaders: readBoolean(proxy.trustHeaders, defaultConfig.proxy.trustHeaders),
      ipHeader: normalizedIpHeader
    },
    appLogin: {
      enabled: readBoolean(appLogin.enabled, defaultConfig.appLogin.enabled),
      sessionTtlSeconds: readNumber(
        appLogin.sessionTtlSeconds,
        defaultConfig.appLogin.sessionTtlSeconds
      ),
      rateLimitWindowMs: readNumber(
        appLogin.rateLimitWindowMs,
        defaultConfig.appLogin.rateLimitWindowMs
      ),
      rateLimitMaxAttempts: readNumber(
        appLogin.rateLimitMaxAttempts,
        defaultConfig.appLogin.rateLimitMaxAttempts
      )
    },
    memory: {
      enabled: readBoolean(memory.enabled, defaultConfig.memory.enabled),
      dbPath: readString(memory.dbPath, defaultConfig.memory.dbPath),
      model: readString(memory.model, defaultConfig.memory.model),
      queueConcurrency: readNumber(memory.queueConcurrency, defaultConfig.memory.queueConcurrency)
    },
    admin: {
      sessionTtlSeconds: readNumber(
        admin.sessionTtlSeconds,
        defaultConfig.admin.sessionTtlSeconds
      )
    },
    webSearch: {
      enabled: readBoolean(webSearch.enabled, defaultConfig.webSearch.enabled),
      model: readString(webSearch.model, defaultConfig.webSearch.model),
      cacheTtlMs: readNumber(webSearch.cacheTtlMs, defaultConfig.webSearch.cacheTtlMs)
    },
    turnstile: {
      siteKey: readString(turnstile.siteKey, defaultConfig.turnstile.siteKey)
    }
  };
};
