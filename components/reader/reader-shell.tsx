"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { useSession } from "@/lib/auth-client";
import FeedSidebar from "./feed-sidebar";
import { useRssStore } from "./rss-store";
import TopBar from "./top-bar";

export default function ReaderShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { feedsError } = useRssStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [isPending, session, router]);

  // Cmd+K focuses search (the input lives in TopBar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Search articles"]')?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isPending || !session) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#FBFBFA] p-10 dark:bg-[#191918]">
        <p className="text-sm text-[#787774]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#FBFBFA] text-[#111111] dark:bg-[#191918] dark:text-[#ECECEA]">
      <TopBar onOpenFeeds={() => setDrawerOpen(true)} />

      {feedsError && (
        <div className="shrink-0 border-b border-[#EAEAEA] bg-[#FDEBEC] px-5 py-2 text-[13px] text-[#9F2F2D] dark:border-white/10 dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]">
          {feedsError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-[#EAEAEA] bg-[#F7F6F3] lg:flex dark:border-white/10 dark:bg-[#232220]">
          <FeedSidebar />
        </aside>
        {children}
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#F7F6F3] shadow-xl dark:bg-[#232220]">
            <div className="flex justify-end p-2">
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close feeds"
                className="rounded-md p-1.5 text-[#787774] hover:bg-white/70 dark:hover:bg-white/5"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <FeedSidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
