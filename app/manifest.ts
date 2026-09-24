import type { MetadataRoute } from "next";

// Web app manifest — required for two things beyond a nicer home-screen icon:
// installability, and (on iOS 16.4+) push notifications, which Safari only
// grants to a PWA that has actually been added to the Home Screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "baddy — badminton sessions",
    short_name: "baddy",
    description: "Court bookings, attendance and reminders for the group.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e0f13",
    theme_color: "#04342C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
