import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// Load Inter font with Latin subset for optimal performance
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI & Beyond Evaluator",
  description:
    "Team performance evaluation and task tracking system for AI & Beyond.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

import Providers from "@/components/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Apply the stored theme class before first paint to prevent a flash of light mode. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('aib_theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
