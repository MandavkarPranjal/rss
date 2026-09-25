import Link from "next/link";
import { Newspaper } from "@phosphor-icons/react/ssr";

const LINKS = [
  { href: "/#reading", label: "Reading" },
  { href: "/#features", label: "Features" },
  { href: "/#self-host", label: "Self-host" },
];

export default function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-black/85 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-5 sm:px-8"
      >
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#fafafa] text-black">
            <Newspaper size={16} weight="bold" />
          </span>
          <span className="font-editorial text-[22px] tracking-[-0.04em]">
            Ledger
          </span>
        </Link>

        <ul className="ml-auto hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm text-[#a3a3a3] transition-colors duration-200 hover:text-[#f2f2f2]"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/sign-in"
          className="ml-auto rounded-[6px] bg-[#fafafa] px-4 py-2 text-sm font-medium text-black transition-colors duration-200 hover:bg-[#e5e5e5] active:translate-y-px md:ml-0"
        >
          Start reading
        </Link>
      </nav>
    </header>
  );
}
