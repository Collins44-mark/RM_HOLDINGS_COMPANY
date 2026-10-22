import os from "os";
import type { NextConfig } from "next";

function localDevOrigins() {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.internal) continue;
      hosts.add(addr.address);
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: localDevOrigins(),
  serverExternalPackages: ["unpdf", "xlsx"],
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async rewrites() {
    return [{ source: "/dashboard", destination: "/owner" }];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/offline-probe",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
