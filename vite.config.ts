import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const proxyTarget = process.env.VITE_PROXY_TARGET || "http://192.168.8.150:8077";

export default defineConfig({
  plugins: [vue()],
server: {
  host: "0.0.0.0",
  port: 5173,
  strictPort: true,
  proxy: {
    "/api": {
      target: proxyTarget,
      changeOrigin: true,
    },
    "/auth": {
      target: proxyTarget,
      changeOrigin: true,
    },
    "/wecom": {
      target: proxyTarget,
      changeOrigin: true,
    },
    "/oidc": {
      target: proxyTarget,
      changeOrigin: true,
    },
    "/iam": {
      target: proxyTarget,
      changeOrigin: true,
    },
  },
}

});
