import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // Work around an invalid `exports` map in @mediapipe/tasks-vision that breaks webpack resolution.
      "@mediapipe/tasks-vision": path.resolve(
        __dirname,
        "node_modules/@mediapipe/tasks-vision/vision_bundle.mjs"
      ),
    };
    return config;
  },
};

export default nextConfig;
