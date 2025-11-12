const DEFAULT_KNOWN_HOSTNAMES = ["event-aggregator-nine.vercel.app"];
const DEFAULT_PREVIEW_PATTERN = /^event-aggregator-.*\.vercel\.app$/i;
const DEFAULT_LOCALHOST_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];
const DEFAULT_KNOWN_ORIGINS = [
  "https://event-aggregator-*.vercel.app",
  "https://event-aggregator-nine.vercel.app",
];

export interface AllowedOriginCheckerOptions {
  webAppUrl?: string;
  knownHostnames?: string[];
  previewHostnamePattern?: RegExp | null;
  additionalHostnames?: string[];
  allowLocalhost?: boolean;
}

export function createAllowedOriginChecker(
  options: AllowedOriginCheckerOptions = {},
): (origin: string) => boolean {
  const {
    webAppUrl,
    knownHostnames = DEFAULT_KNOWN_HOSTNAMES,
    previewHostnamePattern = DEFAULT_PREVIEW_PATTERN,
    additionalHostnames = [],
    allowLocalhost = true,
  } = options;

  const allowedHostnames = new Set(
    [...knownHostnames, ...additionalHostnames].map((hostname) =>
      hostname.toLowerCase()
    ),
  );

  let webAppHostname: string | null = null;
  if (webAppUrl) {
    try {
      webAppHostname = new URL(webAppUrl).hostname.toLowerCase();
    } catch {
      webAppHostname = null;
    }
  }

  return (origin: string): boolean => {
    try {
      const url = new URL(origin);
      const hostname = url.hostname.toLowerCase();

      if (
        allowLocalhost &&
        (hostname === "localhost" ||
          hostname === "127.0.0.1")
      ) {
        return true;
      }

      if (webAppHostname && hostname === webAppHostname) {
        return true;
      }

      if (allowedHostnames.has(hostname)) {
        return true;
      }

      if (previewHostnamePattern?.test(hostname)) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  };
}

export interface AllowedOriginsListOptions {
  webAppUrl?: string;
  vercelUrl?: string;
  currentOrigin?: string;
  includeLocalhost?: boolean;
  localhostOrigins?: string[];
  knownOrigins?: string[];
  additionalOrigins?: string[];
}

export function buildAllowedOriginsList(
  options: AllowedOriginsListOptions = {},
): string[] {
  const {
    webAppUrl,
    vercelUrl,
    currentOrigin,
    includeLocalhost = true,
    localhostOrigins = DEFAULT_LOCALHOST_ORIGINS,
    knownOrigins = DEFAULT_KNOWN_ORIGINS,
    additionalOrigins = [],
  } = options;

  const origins = new Set<string>();

  if (includeLocalhost) {
    for (const origin of localhostOrigins) {
      origins.add(origin);
    }
  }

  for (const origin of knownOrigins) {
    origins.add(origin);
  }

  if (webAppUrl) {
    origins.add(webAppUrl);
  }

  if (vercelUrl) {
    origins.add(
      vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://")
        ? vercelUrl
        : `https://${vercelUrl}`,
    );
  }

  if (currentOrigin) {
    origins.add(currentOrigin);
  }

  for (const origin of additionalOrigins) {
    origins.add(origin);
  }

  return Array.from(origins);
}


