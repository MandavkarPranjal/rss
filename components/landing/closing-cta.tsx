import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";

export default function ClosingCta() {
  return (
    <section className="border-t border-white/[0.08] bg-[#0a0a0a]">
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-8 sm:py-32">
        <h2
          className="font-editorial reveal max-w-[16ch] text-[36px] leading-[1.02] sm:text-[56px]"
          style={{ "--index": 0 } as React.CSSProperties}
        >
          Give the good feeds your full attention.
        </h2>
        <p
          className="reveal mt-7 max-w-[46ch] text-[17px] leading-relaxed text-[#a3a3a3]"
          style={{ "--index": 1 } as React.CSSProperties}
        >
          Sign in with GitHub, add a feed, and read it properly.
        </p>
        <Link
          href="/sign-in"
          className="group reveal mt-10 inline-flex items-center gap-2 rounded-[6px] bg-[#fafafa] px-5 py-3 text-[15px] font-medium whitespace-nowrap text-black transition-colors duration-200 hover:bg-[#e5e5e5] active:translate-y-px"
          style={{ "--index": 2 } as React.CSSProperties}
        >
          Start reading
          <ArrowRight
            size={16}
            weight="bold"
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </section>
  );
}
