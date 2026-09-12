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
  async rewrites() {
    return [{ source: "/dashboard", destination: "/owner" }];
  },
};

export default nextConfig;
