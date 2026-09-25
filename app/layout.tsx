import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ledger — a calm RSS reader",
  description: "A quiet, editorial RSS reader. Follow feeds, skim less, read more.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-[#f2f2f2]">
        <NuqsAdapter>
          {children}
          <Toaster />
        </NuqsAdapter>
      </body>
    </html>
  );
}
