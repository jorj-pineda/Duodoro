import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Pixelify_Sans } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import MotionProvider from "@/components/MotionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pixelSans = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
});

// Runs before paint: picks saved theme or system preference so there's no flash
const themeInitScript = `(function(){try{var t=localStorage.getItem("duodoro-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;

export const metadata: Metadata = {
  title: "Duodoro — Focus together, anywhere.",
  description: "A real-time focus timer for long-distance couples and friends. Walk toward each other, meet in the middle, and celebrate your session together.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.svg", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Duodoro",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Duodoro",
    description: "Focus together, anywhere..",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3ede1" },
    { media: "(prefers-color-scheme: dark)", color: "#171411" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pixelSans.variable} font-sans antialiased`}
      >
        <MotionProvider>{children}</MotionProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
