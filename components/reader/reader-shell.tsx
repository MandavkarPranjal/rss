"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { useSession } from "@/lib/auth-client";
import FeedSidebar from "./feed-sidebar";
import { useRssStore } from "./rss-store";
import TopBar from "./top-bar";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ReaderShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { feedsError } = useRssStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const drawerRestoreFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [isPending, session, router]);

  // Cmd+K focuses search (the input lives in TopBar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // Two inputs share this label (desktop `md:block`, mobile `md:hidden`):
        // `querySelector` always returns the desktop one, which is
        // `display: none` below the md breakpoint, so focus would vanish.
        const inputs = Array.from(
          document.querySelectorAll<HTMLInputElement>('input[aria-label="Search articles"]'),
        );
        (inputs.find((el) => el.offsetParent !== null) ?? inputs[0])?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mobile feeds drawer as an accessible modal: Escape closes (like the
  // settings modal), scroll locks, focus moves in on open, Tab is trapped
  // inside, and focus returns to the trigger on close.
  useEffect(() => {
    if (!drawerOpen) return;
    drawerRestoreFocusRef.current = document.activeElement;
    const panel = drawerPanelRef.current;
    panel
      ?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      // The mobile trigger is hidden once the desktop drawer takes over, so
      // do not restore focus to it after a breakpoint-driven close.
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        (drawerRestoreFocusRef.current as HTMLElement | null)?.focus?.();
      }
    };
  }, [drawerOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawerOnDesktop = () => {
      if (desktop.matches) setDrawerOpen(false);
    };
    closeDrawerOnDesktop();
    desktop.addEventListener("change", closeDrawerOnDesktop);
    return () => desktop.removeEventListener("change", closeDrawerOnDesktop);
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
      <div aria-hidden={drawerOpen || undefined} inert={drawerOpen || undefined}>
        <TopBar onOpenFeeds={() => setDrawerOpen(true)} />
      </div>

      {feedsError && (
        <div
          aria-hidden={drawerOpen || undefined}
          inert={drawerOpen || undefined}
          className="shrink-0 border-b border-[#EAEAEA] bg-[#FDEBEC] px-5 py-2 text-[13px] text-[#9F2F2D] dark:border-white/10 dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]"
        >
          {feedsError}
        </div>
      )}

      <div
        aria-hidden={drawerOpen || undefined}
        inert={drawerOpen || undefined}
        className="flex min-h-0 flex-1"
      >
        <aside className="hidden w-72 shrink-0 flex-col border-r border-[#EAEAEA] bg-[#F7F6F3] lg:flex dark:border-white/10 dark:bg-[#232220]">
          <FeedSidebar />
        </aside>
        {children}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onMouseDown={() => setDrawerOpen(false)} />
          <div
            ref={drawerPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Feeds"
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#F7F6F3] shadow-xl dark:bg-[#232220]"
          >
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
