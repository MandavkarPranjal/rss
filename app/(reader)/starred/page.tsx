"use client";

import FeedView from "@/components/reader/feed-view";

export default function StarredPage() {
  return <FeedView feedId={null} filter="starred" heading="Starred" />;
}
