import { resolve } from 'node:path';

// El API (server/index.mjs) corre en :3000; en desarrollo Vite lo proxea.
// /sv/<ip>/... → go2rtc del servidor (status + video MSE por WebSocket).
// En producción nginx hace ambos proxys (ver README).
export default {
  resolve: {
    alias: {
      // Misma resolución IP→proyecto / status bucket que el API (shared/*.mjs)
      '@shared/serverNames': resolve(import.meta.dirname, '../shared/serverNames.mjs'),
      '@shared/statusBucket': resolve(import.meta.dirname, '../shared/statusBucket.mjs'),
    },
  },
  build: {
    target: 'es2022',   // top-level await en main.js
    rollupOptions: {
      input: {
        main:      resolve(import.meta.dirname, 'index.html'),
        login:     resolve(import.meta.dirname, 'login.html'),
        admin:     resolve(import.meta.dirname, 'admin.html'),
        guia:      resolve(import.meta.dirname, 'guia.html'),
        videowall:      resolve(import.meta.dirname, 'videowall.html'),
        notifications: resolve(import.meta.dirname, 'notifications.html'),
        detections: resolve(import.meta.dirname, 'detections.html'),
        'alarm-video': resolve(import.meta.dirname, 'alarm-video.html'),
        'detection-video': resolve(import.meta.dirname, 'detection-video.html'),
      },
    },
  },
  server: {
    fs: { allow: [resolve(import.meta.dirname, '..')] },
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      // proxys estáticos por servidor (el router dinámico no funciona para WS)
      ...Object.fromEntries(
        ['172.20.0.195', '172.20.0.146', '172.20.0.144'].map(ip => [
          `/sv/${ip}`,
          {
            target: `http://${ip}:1984`,
            changeOrigin: true,
            ws: true,
            rewrite: p => p.replace(new RegExp(`^/sv/${ip.replace(/\./g, '\\.')}`), ''),
          },
        ])
      ),
    },
  },
};
