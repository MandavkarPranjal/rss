"use client";

import { use } from "react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import FeedView from "@/components/reader/feed-view";
import type { RssFilter } from "@/lib/rss-types";

const FILTERS: RssFilter[] = ["all", "unread", "starred"];

export default function FeedPage({ params }: { params: Promise<{ feedId: string }> }) {
  const { feedId } = use(params);
  const [filter] = useQueryState(
    "filter",
    parseAsStringEnum<RssFilter>(FILTERS).withDefault("unread"),
  );
  const heading =
    filter === "starred" ? "Starred" : filter === "all" ? "Everything" : "Unread";

  return <FeedView feedId={feedId} filter={filter} heading={heading} />;
}
