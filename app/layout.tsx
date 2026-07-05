import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import SplashCursor from "@/components/SplashCursor";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "Jr. Talha | Talha's AI Assistant",
  description:
    "Ask Jr. Talha about Talha's skills, projects, freelance work, and AI/ML experience. Powered by RAG — answers grounded in verified knowledge only.",
  keywords: [
    "Talha",
    "AI assistant",
    "portfolio",
    "chatbot",
    "RAG",
    "freelance",
    "AI/ML",
  ],
  robots: "index, follow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col text-[var(--color-warm-white)] font-sans relative">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="fixed inset-0 w-full h-full object-cover -z-50 pointer-events-none"
        >
          <source src="/agent_wallpaper.mp4" type="video/mp4" />
        </video>
        <SplashCursor />
        {children}
      </body>
    </html>
  );
}
