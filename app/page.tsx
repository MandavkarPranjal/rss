import ClosingCta from "@/components/landing/closing-cta";
import Features from "@/components/landing/features";
import Hero from "@/components/landing/hero";
import ReadingSurface from "@/components/landing/reading-surface";
import RevealInit from "@/components/landing/reveal-init";
import SelfHost from "@/components/landing/self-host";
import SiteFooter from "@/components/landing/site-footer";
import SiteNav from "@/components/landing/site-nav";
import "./landing.css";

export default function LandingPage() {
  return (
    <div className="landing-root min-h-[100dvh] bg-black">
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
