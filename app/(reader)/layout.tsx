import type { ReactNode } from "react";
import { Suspense } from "react";
import ReaderShell from "@/components/reader/reader-shell";
import { RssStoreProvider } from "@/components/reader/rss-store";

// Prerendered placeholder while the search-params-backed reader
// (nuqs `useQueryState` suspends during static generation) hydrates.
function ReaderLoading() {
  return (
    <div
      aria-label="Loading reader"
      className="flex h-screen flex-col bg-[#FBFBFA] dark:bg-[#191918]"
    >
      <div className="h-16 shrink-0 border-b border-[#EAEAEA] dark:border-white/10" />
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-72 shrink-0 animate-pulse flex-col gap-2 border-r border-[#EAEAEA] p-4 lg:flex dark:border-white/10">
          <div className="h-3 w-1/3 rounded bg-[#EAEAEA] dark:bg-white/10" />
          <div className="h-9 rounded-[6px] bg-[#EAEAEA] dark:bg-white/10" />
          <div className="h-9 rounded-lg bg-[#EAEAEA] dark:bg-white/10" />
          <div className="h-9 rounded-lg bg-[#EAEAEA] dark:bg-white/10" />
        </div>
        <div className="flex w-full min-w-0 animate-pulse flex-col gap-3 p-5 sm:w-[380px] sm:shrink-0">
          <div className="h-6 w-2/5 rounded bg-[#EAEAEA] dark:bg-white/10" />
          <div className="h-20 rounded-lg bg-[#EAEAEA] dark:bg-white/10" />
          <div className="h-20 rounded-lg bg-[#EAEAEA] dark:bg-white/10" />
          <div className="h-20 rounded-lg bg-[#EAEAEA] dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export default function ReaderLayout({ children }: { children: ReactNode }) {
  return (
    <RssStoreProvider>
      <Suspense fallback={<ReaderLoading />}>
        <ReaderShell>{children}</ReaderShell>
      </Suspense>
    </RssStoreProvider>
  );
}
