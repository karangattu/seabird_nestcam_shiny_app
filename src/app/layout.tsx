import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seabird NestCam Annotation",
  description: "A PWA for reviewing seabird nest camera images and syncing annotations to Google Sheets.",
  applicationName: "Seabird NestCam",
  appleWebApp: {
    capable: true,
    title: "NestCam",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1f6f78",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}