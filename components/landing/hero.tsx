import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";

export default function Hero() {
  return (
    <section className="mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col justify-center px-5 pt-24 pb-16 sm:px-8">
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
        <div>
          <p
            className="rise font-mono text-[11px] tracking-[0.2em] text-[#6e6e6e] uppercase"
            style={{ "--d": 0 } as React.CSSProperties}
          >
            A calm RSS reader
          </p>

          <h1
            className="rise font-editorial mt-6 text-[38px] leading-[1.02] sm:text-[52px] lg:text-[60px]"
            style={{ "--d": 1 } as React.CSSProperties}
          >
            Every feed you follow,
            <br />
            in one reader.
          </h1>

          <p
            className="rise mt-7 max-w-[46ch] text-[17px] leading-relaxed text-[#a3a3a3]"
            style={{ "--d": 2 } as React.CSSProperties}
          >
            Ledger pulls your RSS and Atom feeds into one reading surface,
            with folders, search, and clean full-text pages.
          </p>

          <div
            className="rise mt-9 flex flex-wrap items-center gap-3"
            style={{ "--d": 3 } as React.CSSProperties}
          >
            <Link
              href="/sign-in"
              className="group inline-flex items-center gap-2 rounded-[6px] bg-[#fafafa] px-5 py-3 text-[15px] font-medium whitespace-nowrap text-black transition-colors duration-200 hover:bg-[#e5e5e5] active:translate-y-px"
            >
              Start reading
              <ArrowRight
                size={16}
                weight="bold"
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href="/#self-host"
              className="rounded-[6px] border border-white/[0.16] px-5 py-3 text-[15px] whitespace-nowrap text-[#f2f2f2] transition-colors duration-200 hover:border-white/30 hover:bg-white/[0.04] active:translate-y-px"
            >
              Self-host
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="frame rise overflow-hidden" style={{ "--d": 2 } as React.CSSProperties}>
            <Image
              src="/landing/reader-hero.webp"
              alt="Ledger open on a feed, with the folder sidebar, the story list, and an article"
              width={1880}
              height={930}
              priority
              sizes="(max-width: 1024px) 100vw, 56vw"
              className="block w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
