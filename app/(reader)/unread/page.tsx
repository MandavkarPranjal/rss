"use client";

import FeedView from "@/components/reader/feed-view";

export default function UnreadPage() {
  return <FeedView feedId={null} filter="unread" heading="Unread" />;
}
