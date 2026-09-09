import type { ReactNode } from "react";
import ReaderShell from "@/components/reader/reader-shell";
import { RssStoreProvider } from "@/components/reader/rss-store";

export default function ReaderLayout({ children }: { children: ReactNode }) {
  return (
    <RssStoreProvider>
      <ReaderShell>{children}</ReaderShell>
    </RssStoreProvider>
  );
}
