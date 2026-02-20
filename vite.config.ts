import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: [],
            manifest: {
                name: "Push PWA App",
                short_name: "PushPWA",
                description: "React + Firebase push-enabled PWA",
                theme_color: "#f8fafc",
                background_color: "#f8fafc",
                display: "standalone",
                start_url: "/",
                scope: "/",
                icons: [
                    {
                        src: "/icons/pwa-192x192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "/icons/pwa-512x512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                    {
                        src: "/icons/pwa-512x512-maskable.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
            workbox: {
                navigateFallback: "/index.html",
                globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
            },
        }),
    ],
    server: {
        allowedHosts: true,
    },
});
