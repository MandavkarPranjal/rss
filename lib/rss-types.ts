export type RssFilter = "all" | "unread" | "starred";

export type Feed = {
  id: string;
  url: string;
  title: string;
  siteUrl?: string | null;
  unreadCount: number;
};

export type Article = {
  id: string;
  feedId: string;
  title: string;
  link?: string | null;
  snippet?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  isRead: boolean;
  isStarred: boolean;
  feedTitle?: string | null;
};
