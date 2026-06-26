/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

import { enableTailwind } from "@remotion/tailwind-v4";

import { applyRemotionRenderConfig } from "./src/renderDefaults";

/** Remotion Studio na Mikrusie — proxy wykr.es, bez render-config z desktopu. */
const isVpsStudio = process.env.REMOTION_STUDIO_VPS === "1";

if (isVpsStudio) {
  // Bez cache — unikamy starych artefaktów webpacka w kontenerze.
  Config.setCachingEnabled(false);
} else {
  applyRemotionRenderConfig(Config);
}

Config.setOverwriteOutput(true);

Config.overrideWebpackConfig((config) => {
  const next = enableTailwind(config);

  next.watchOptions = {
    ...next.watchOptions,
    ignored: [
      "**/node_modules/**",
      "**/photos/**",
      "**/panel/**",
      "**/server/**",
      ...(isVpsStudio ? ["**/generated/**"] : ["**/generated/video-users/**"]),
      "**/.next/**",
      "**/probe-err*.txt",
    ],
  };

  if (config.mode === "development") {
    const prev = (next.devServer ?? {}) as Record<string, unknown>;
    const prevClient = (prev.client ?? {}) as Record<string, unknown>;
    next.devServer = {
      ...prev,
      host: "0.0.0.0",
      allowedHosts: "all",
      client: {
        ...prevClient,
        webSocketURL: "auto://0.0.0.0:0/ws",
      },
    };
  }

  return next;
});
