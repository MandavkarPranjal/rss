import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---- Better Auth core tables ----

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ---- Passkey plugin table ----

export const passkey = pgTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull().unique(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"),
  createdAt: timestamp("created_at").defaultNow(),
  aaguid: text("aaguid"),
});

// ---- RSS reader tables ----

export const feed = pgTable("feed", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title").notNull(),
  siteUrl: text("site_url"),
  description: text("description"),
  lastFetchedAt: timestamp("last_fetched_at"),
  lastFetchError: text("last_fetch_error"),
  fetchFailureCount: integer("fetch_failure_count").notNull().default(0),
  nextFetchAt: timestamp("next_fetch_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("feed_user_id_idx").on(t.userId),
  uniqueIndex("feed_user_url_uidx").on(t.userId, t.url),
]);

export const article = pgTable("article", {
  id: text("id").primaryKey(),
  feedId: text("feed_id")
    .notNull()
    .references(() => feed.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  guid: text("guid").notNull(),
  title: text("title").notNull(),
  link: text("link"),
  snippet: text("snippet"),
  content: text("content"),
  author: text("author"),
  imageUrl: text("image_url"),
  publishedAt: timestamp("published_at"),
  isRead: boolean("is_read").notNull().default(false),
  isStarred: boolean("is_starred").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // List view: WHERE user_id + is_read/is_starred/feed_id ORDER BY published_at DESC
  index("article_user_read_published_idx").on(t.userId, t.isRead, t.publishedAt),
  index("article_user_feed_read_idx").on(t.userId, t.feedId, t.isRead),
  index("article_user_starred_idx").on(t.userId, t.isStarred),
  index("article_user_published_idx").on(t.userId, t.publishedAt),
  // Ingest dedup check: WHERE feed_id + guid
  uniqueIndex("article_feed_guid_uidx").on(t.feedId, t.guid),
]);

export type Feed = typeof feed.$inferSelect;
export type Article = typeof article.$inferSelect;
