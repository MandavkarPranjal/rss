"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { GearSix, MagnifyingGlass, Newspaper, SignOut } from "@phosphor-icons/react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";
import { useRssStore } from "./rss-store";
import { useSearchQuery, useSelectedArticleId } from "./use-articles";

export default function TopBar({
  onOpenFeeds,
  onOpenSettings,
}: {
  onOpenFeeds: () => void;
  onOpenSettings: () => void;
}) {
  const { totalUnread } = useRssStore();
  const { data: session } = useSession();
  const router = useRouter();
  const [query, setQuery] = useSearchQuery();
  const [selectedArticleId] = useSelectedArticleId();
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="reader-chrome flex h-[72px] shrink-0 items-center gap-3 border-b border-[#ddd8ce] bg-[#fbfaf7]/90 px-4 backdrop-blur sm:px-7">
        <button
          className="rounded-md border border-[#c8c1b5] px-2 py-1 text-xs lg:hidden"
          onClick={onOpenFeeds}
        >
          Feeds
        </button>
        <Link href="/unread" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#fafafa] text-black">
            <Newspaper size={16} weight="bold" />
          </span>
          <span className="font-editorial text-[22px] tracking-[-0.04em]">Ledger</span>
          <span className="hidden border-l border-[#c8c1b5] pl-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#817c73] sm:inline-block">
            {totalUnread} unread
          </span>
        </Link>

        <div className="relative mx-auto hidden w-full max-w-md md:block">
          <MagnifyingGlass
            size={15}
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#787774]"
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value || null)}
            placeholder="Search articles"
            aria-label="Search articles"
            className="w-full rounded-[3px] border border-[#ddd8ce] bg-[#ebe7df]/70 py-2 pr-14 pl-9 text-sm outline-none placeholder:text-[#817c73] focus:border-white focus:bg-black"
          />
          <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
            <kbd>⌘K</kbd>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 text-sm md:ml-0">
          <span className="hidden max-w-40 truncate text-[13px] text-[#787774] xl:inline">
            {session?.user.email}
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            title="Account settings"
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#c8c1b5] px-2.5 py-1.5 text-[13px] transition hover:bg-white/10 active:scale-[0.98]"
          >
            <GearSix size={14} weight="bold" /> <span className="hidden sm:inline">Settings</span>
          </button>
          <button
            aria-label="Sign out"
            onClick={() => {
              const request = authClient.signOut().then(({ error }) => {
                if (error) throw new Error(error.message ?? "Could not sign out");
                router.replace("/sign-in");
              });
              toast.promise(request, {
                loading: "Signing out…",
                success: "Signed out",
                error: (error) => (error instanceof Error ? error.message : "Could not sign out"),
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#c8c1b5] px-2.5 py-1.5 text-[13px] transition hover:bg-white/10 active:scale-[0.98]"
          >
            <SignOut size={14} weight="bold" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {!selectedArticleId && (
        <div className="border-b border-[#ddd8ce] bg-[#fbfaf7] px-4 py-2 md:hidden">
          <div className="relative">
            <MagnifyingGlass
              size={15}
              weight="bold"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#787774]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value || null)}
              placeholder="Search articles"
              aria-label="Search articles"
              className="w-full rounded-[3px] border border-[#ddd8ce] bg-[#ebe7df] py-2 pr-3 pl-9 text-sm"
            />
          </div>
        </div>
      )}
    </>
  );
}
