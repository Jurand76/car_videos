/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setVideoImageFormat("jpeg");
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
      "**/generated/video-users/**",
      "**/.next/**",
      "**/probe-err*.txt",
    ],
  };
  return next;
});
