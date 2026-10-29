import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

// Minimal worker-scope typing (avoids webworker lib conflicts with DOM lib).
declare const self: {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Never cache auth, API, or dashboard responses — private data only.
  runtimeCaching: [
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/dashboard") ||
        url.pathname.startsWith("/admin") ||
        url.pathname === "/login" ||
        url.pathname === "/register",
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request }) => request.destination === "image",
      handler: new CacheFirst({
        cacheName: "tix-images",
        plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 })],
      }),
    },
    {
      matcher: ({ request }) =>
        request.destination === "style" ||
        request.destination === "script" ||
        request.destination === "font",
      handler: new StaleWhileRevalidate({ cacheName: "tix-static" }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
