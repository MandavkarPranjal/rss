import Link from "next/link";
import { Newspaper } from "@phosphor-icons/react/ssr";

const LINKS = [
  { href: "/#reading", label: "Reading" },
  { href: "/#features", label: "Features" },
  { href: "/#self-host", label: "Self-host" },
  { href: "/sign-in", label: "Sign in" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.08]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-[#fafafa] text-black">
            <Newspaper size={14} weight="bold" />
          </span>
          <span className="font-editorial text-[20px] tracking-[-0.04em]">
            Ledger
          </span>
        </div>

        <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-[14px] text-[#6e6e6e] transition-colors duration-200 hover:text-[#f2f2f2]"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href="https://github.com/MandavkarPranjal/rss"
              className="text-[14px] text-[#6e6e6e] transition-colors duration-200 hover:text-[#f2f2f2]"
            >
              Source
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
