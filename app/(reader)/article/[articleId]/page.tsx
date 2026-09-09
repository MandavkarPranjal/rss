"use client";

import Link from "next/link";
import { use } from "react";
import ArticleReader from "@/components/reader/article-reader";

export default function ArticlePage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = use(params);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FBFBFA] dark:bg-[#191918]">
      <div className="shrink-0 border-b border-[#EAEAEA] px-6 py-3 sm:px-10 dark:border-white/10">
        <Link
          href="/unread"
          className="text-[13px] text-[#787774] underline decoration-[#EAEAEA] underline-offset-4 hover:text-[#111111] dark:hover:text-white"
        >
          ← Back to stories
        </Link>
      </div>
      <ArticleReader articleId={articleId} />
    </main>
  );
}
