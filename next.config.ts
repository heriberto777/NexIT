import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para el runner de Docker: empaqueta un server.js mínimo con solo
  // las dependencias de producción usadas realmente (ver Dockerfile).
  output: "standalone",
};

export default nextConfig;
