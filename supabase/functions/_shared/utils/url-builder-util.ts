import {
  createAllowedOriginChecker,
} from "../../packages/shared/dist/utils/origin.js";

const WEB_APP_URL = Deno.env.get("WEB_APP_URL") ?? "http://localhost:3000";

export const isAllowedOrigin = createAllowedOriginChecker({
  webAppUrl: WEB_APP_URL,
  knownHostnames: ["event-aggregator-nine.vercel.app"],
});
