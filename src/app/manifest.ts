import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Seabird Nest Camera Annotation",
    short_name: "NestCam",
    description: "Review seabird nest camera images and sync structured annotations.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f6",
    theme_color: "#1f6f78",
    orientation: "any",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}