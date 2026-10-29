import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TIXCONNECKT",
    short_name: "TIXCONNECKT",
    description:
      "Connect through compatible skills, career objectives, collaborative projects, and funding.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/logo.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
