import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingIncludes: {
    "/**": [
      "./data/bm_wbw_complete.json",
      "./data/qul/english-wbw-translation.json",
    ],
  },
};

export default nextConfig;
