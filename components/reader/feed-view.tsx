"use client";

import ArticleList from "./article-list";
import ArticleReader from "./article-reader";
import type { RssFilter } from "@/lib/rss-types";
import { useSelectedArticleId } from "./use-articles";

export default function FeedView({
  feedId,
  filter,
  heading,
}: {
  feedId: string | null;
  filter: RssFilter;
  heading: string;
}) {
  const [articleId, setArticleId] = useSelectedArticleId();

  // Mobile: reader takes over when an article is selected, list otherwise.
  // Desktop (md+): both panes visible side by side. The wrapper must not
  // grow (no flex-1): ArticleList is a fixed 380px column and any extra
  // wrapper width would surface as dead space between list and reader.
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className={`${articleId ? "hidden" : "flex"} min-h-0 sm:shrink-0 md:flex`}>
        <ArticleList feedId={feedId} filter={filter} heading={heading} />
      </div>
      <main
        className={`${articleId ? "flex" : "hidden"} min-w-0 flex-1 flex-col overflow-hidden bg-[#FBFBFA] md:flex dark:bg-[#191918]`}
      >
        <ArticleReader articleId={articleId} onBack={() => setArticleId(null)} showBack />
      </main>
    </div>
  );
}
