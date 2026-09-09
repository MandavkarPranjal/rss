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
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#EAEAEA] bg-white/85 px-4 backdrop-blur sm:px-5 dark:border-white/10 dark:bg-[#201F1E]/85">
        <button
          className="rounded-md border border-[#EAEAEA] px-2 py-1 text-xs lg:hidden dark:border-white/10"
          onClick={onOpenFeeds}
        >
          Feeds
        </button>
        <Link href="/unread" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#111111] text-white dark:bg-[#ECECEA] dark:text-[#191918]">
            <Newspaper size={16} weight="bold" />
          </span>
          <span className="font-editorial text-[19px] font-medium tracking-tight">Ledger</span>
          <span className="hidden rounded-full bg-[#FBF3DB] px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[#956400] sm:inline-block dark:bg-[#956400]/25 dark:text-[#E8C26A]">
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
            className="w-full rounded-[6px] border border-[#EAEAEA] bg-[#F7F6F3] py-2 pr-14 pl-9 text-sm outline-none placeholder:text-[#787774] focus:border-[#111111] focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-transparent"
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
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#EAEAEA] px-2.5 py-1.5 text-[13px] transition hover:bg-[#F7F6F3] active:scale-[0.98] dark:border-white/10 dark:hover:bg-white/5"
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
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#EAEAEA] px-2.5 py-1.5 text-[13px] transition hover:bg-[#F7F6F3] active:scale-[0.98] dark:border-white/10 dark:hover:bg-white/5"
          >
            <SignOut size={14} weight="bold" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {!selectedArticleId && (
        <div className="border-b border-[#EAEAEA] bg-white px-4 py-2 md:hidden dark:border-white/10 dark:bg-[#201F1E]">
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
              className="w-full rounded-[6px] border border-[#EAEAEA] bg-[#F7F6F3] py-2 pr-3 pl-9 text-sm dark:border-white/10 dark:bg-white/5"
            />
          </div>
        </div>
      )}
    </>
  );
}
