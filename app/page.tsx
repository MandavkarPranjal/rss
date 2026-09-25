import type { Metadata } from "next";
import ClosingCta from "@/components/landing/closing-cta";
import Features from "@/components/landing/features";
import Hero from "@/components/landing/hero";
import ReadingSurface from "@/components/landing/reading-surface";
import RevealInit from "@/components/landing/reveal-init";
import SelfHost from "@/components/landing/self-host";
import SiteFooter from "@/components/landing/site-footer";
import SiteNav from "@/components/landing/site-nav";
import "./landing.css";

export const metadata: Metadata = {
  title: "Ledger - a calm RSS reader",
  description:
    "A quiet, editorial RSS reader. Follow feeds, skim less, read more.",
};

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-black">
      <RevealInit />
      <SiteNav />
      <main>
        <Hero />
        <ReadingSurface />
        <Features />
        <SelfHost />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
