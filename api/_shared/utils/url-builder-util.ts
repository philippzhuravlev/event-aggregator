import process from "node:process";

import {
  buildAllowedOriginsList,
  createAllowedOriginChecker,
} from "@event-aggregator/shared/utils/origin";

const WEB_APP_URL = process.env.WEB_APP_URL ?? "http://localhost:3000";
const VERCEL_URL = process.env.VERCEL_URL ?? undefined;

export const isAllowedOrigin = createAllowedOriginChecker({
  webAppUrl: WEB_APP_URL,
  knownHostnames: ["event-aggregator-nine.vercel.app"],
});

export function getAllowedOrigins(currentOrigin?: string): string[] {
  return buildAllowedOriginsList({
    webAppUrl: WEB_APP_URL,
    vercelUrl: VERCEL_URL,
    currentOrigin,
  });
}
