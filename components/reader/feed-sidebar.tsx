"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { CaretRight, Checks, Folder, FolderPlus, Plus, Trash } from "@phosphor-icons/react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { api } from "@/lib/rss-client";
import type { Feed, RssFilter } from "@/lib/rss-types";
import { useRssStore } from "./rss-store";
import { useSearchQuery, useSelectedArticleId } from "./use-articles";

const FILTERS: RssFilter[] = ["all", "unread", "starred"];
const UNGROUPED_DROP_ID = "__ungrouped__";

type DropTargetData = { folderId: string | null };

function filterHref(f: RssFilter, query: string) {
  return query ? `/${f}?q=${encodeURIComponent(query)}` : `/${f}`;
}

const feedLinkCls = (active: boolean) =>
  `mt-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
    active
      ? "border border-white/20 bg-[#141414] font-medium text-white shadow-[inset_2px_0_0_#fafafa]"
      : "border border-transparent text-[#8a8a8a] hover:bg-[#141414] hover:text-white"
  }`;

function FeedLink({
  feed,
  href,
  nested,
  active,
  onNavigate,
}: {
  feed: Feed;
  href: string;
  nested: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  // Mouse: drag starts after 8px so clicks still navigate.
  // Touch: long-press starts a drag; movement before that scrolls the list.
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: feed.id,
    data: { type: "feed" },
  });
  return (
    <Link
      ref={setNodeRef}
      href={href}
      onClick={onNavigate}
      className={`${feedLinkCls(active)} ${nested ? "ml-4" : ""} cursor-grab touch-manipulation active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
      {...listeners}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${feed.unreadCount > 0 ? "bg-white" : "bg-white/15"}`}
      />
      <span className="min-w-0 flex-1 truncate">{feed.title}</span>
      {feed.unreadCount > 0 && (
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-[#e5e5e5]">
          {feed.unreadCount}
        </span>
      )}
    </Link>
  );
}

function DropZone({
  id,
  folderId,
  className,
  children,
}: {
  id: string;
  folderId: string | null;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { folderId } satisfies DropTargetData,
  });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${
        isOver ? "rounded-lg bg-white/[0.06] ring-1 ring-white/25" : ""
      }`}
    >
      {children}
    </div>
  );
}

export default function FeedSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    feeds,
    folders,
    totalUnread,
    loadFeeds,
    invalidateArticlesCache,
    revalidateCurrent,
    setFeeds,
    setFolders,
    setFeedsError,
  } = useRssStore();
  const [query] = useSearchQuery();
  const [, setArticleId] = useSelectedArticleId();
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [dragFeedId, setDragFeedId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  // Active scope derived from the route: /feed/[id], /folder/[id], or /<filter>.
  const feedMatch = pathname.match(/^\/feed\/([^/]+)/);
  const activeFeedId = feedMatch?.[1] ?? null;
  const folderMatch = pathname.match(/^\/folder\/([^/]+)/);
  const activeFolderId = folderMatch?.[1] ?? null;
  const activeTopFilter: RssFilter | null = pathname.startsWith("/starred")
    ? "starred"
    : pathname.startsWith("/all")
      ? "all"
      : pathname.startsWith("/unread")
        ? "unread"
        : null;

  // Feed and folder pages keep their filter in ?filter= (nuqs); top-level pages use the route.
  const [feedFilter, setFeedFilter] = useQueryState(
    "filter",
    parseAsStringEnum<RssFilter>(FILTERS).withDefault("unread"),
  );
  const scopedId = activeFeedId ?? activeFolderId;
  const effectiveFilter: RssFilter = scopedId ? feedFilter : (activeTopFilter ?? "unread");

  // A folder switch while the rename form is open would retarget the form at
  // the newly active folder; close it instead (render-phase state adjust).
  const [renameFolderId, setRenameFolderId] = useState<string | null>(activeFolderId);
  if (activeFolderId !== renameFolderId) {
    setRenameFolderId(activeFolderId);
    setRenamingFolder(false);
  }

  const addFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setLoading(true);
    setFeedsError("");
    const feedUrl = newUrl.trim();
    const request = (async () => {
      await api("/api/rss/feeds", { method: "POST", body: JSON.stringify({ url: feedUrl }) });
      setNewUrl("");
      invalidateArticlesCache();
      loadFeeds();
      revalidateCurrent();
    })();
    toast.promise(request, {
      loading: "Adding feed…",
      success: "Feed added",
      error: (error) => (error instanceof Error ? error.message : "Failed to add feed"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to add feed");
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async (feedId: string | null) => {
    setFeeds((prev) =>
      prev.map((f) => (!feedId || f.id === feedId ? { ...f, unreadCount: 0 } : f)),
    );
    const request = api("/api/rss/articles/mark-all-read", {
        method: "POST",
        body: JSON.stringify(feedId ? { feedId } : {}),
      });
    toast.promise(request, {
      loading: "Marking stories as read…",
      success: "All stories marked read",
      error: (error) => (error instanceof Error ? error.message : "Failed to mark all read"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to mark all read");
    }
    revalidateCurrent();
    loadFeeds();
  };

  const refreshFeed = async (feedId: string) => {
    setLoading(true);
    const request = (async () => {
      await api(`/api/rss/feeds/${feedId}/refresh`, { method: "POST" });
      invalidateArticlesCache();
      revalidateCurrent();
      loadFeeds();
    })();
    toast.promise(request, {
      loading: "Refreshing feed…",
      success: "Feed refreshed",
      error: (error) => (error instanceof Error ? error.message : "Refresh failed"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  };

  const removeFeed = async (feedId: string) => {
    if (!confirm("Remove this feed and its articles?")) return;
    const request = (async () => {
      await api(`/api/rss/feeds/${feedId}`, { method: "DELETE" });
      invalidateArticlesCache();
      loadFeeds();
      // The footer only renders on /feed/:id, so without navigating the
      // reader keeps querying the deleted feed and shows an empty view.
      if (feedId === activeFeedId) {
        router.replace(filterHref(effectiveFilter, query));
        onNavigate?.();
      }
    })();
    toast.promise(request, {
      loading: "Removing feed…",
      success: "Feed removed",
      error: (error) => (error instanceof Error ? error.message : "Failed to remove feed"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to remove feed");
    }
  };

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    setLoading(true);
    setFeedsError("");
    const request = (async () => {
      await api("/api/rss/folders", { method: "POST", body: JSON.stringify({ name }) });
      setNewFolderName("");
      setFolderFormOpen(false);
      loadFeeds();
    })();
    toast.promise(request, {
      loading: "Creating folder…",
      success: "Folder created",
      error: (error) => (error instanceof Error ? error.message : "Failed to create folder"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to create folder");
    } finally {
      setLoading(false);
    }
  };

  const renameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = renameName.trim();
    if (!name || !activeFolderId) return;
    setLoading(true);
    setFeedsError("");
    const request = (async () => {
      await api(`/api/rss/folders/${activeFolderId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setRenamingFolder(false);
      loadFeeds();
    })();
    toast.promise(request, {
      loading: "Renaming folder…",
      success: "Folder renamed",
      error: (error) => (error instanceof Error ? error.message : "Failed to rename folder"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to rename folder");
    } finally {
      setLoading(false);
    }
  };

  const removeFolder = async (folderId: string) => {
    if (!confirm("Delete this folder? Its feeds stay, ungrouped.")) return;
    const request = (async () => {
      await api(`/api/rss/folders/${folderId}`, { method: "DELETE" });
      invalidateArticlesCache();
      loadFeeds();
      // The footer only renders on /folder/:id, so without navigating the
      // reader keeps querying the deleted folder and shows an empty view.
      if (folderId === activeFolderId) {
        router.replace(filterHref(effectiveFilter, query));
        onNavigate?.();
      }
    })();
    toast.promise(request, {
      loading: "Deleting folder…",
      success: "Folder deleted",
      error: (error) => (error instanceof Error ? error.message : "Failed to delete folder"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to delete folder");
    }
  };

  const markFolderRead = async (folderId: string) => {
    setFeeds((prev) =>
      prev.map((f) => (f.folderId === folderId ? { ...f, unreadCount: 0 } : f)),
    );
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, unreadCount: 0 } : f)),
    );
    const request = api("/api/rss/articles/mark-all-read", {
        method: "POST",
        body: JSON.stringify({ folderId }),
      });
    toast.promise(request, {
      loading: "Marking stories as read…",
      success: "All stories marked read",
      error: (error) => (error instanceof Error ? error.message : "Failed to mark all read"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to mark all read");
    }
    revalidateCurrent();
    loadFeeds();
  };

  const moveFeed = async (feedId: string, folderId: string | null) => {
    setFeedsError("");
    const request = (async () => {
      await api(`/api/rss/feeds/${feedId}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId }),
      });
      // Folder-scoped article views change membership, not just counts.
      invalidateArticlesCache();
      revalidateCurrent();
      loadFeeds();
    })();
    toast.promise(request, {
      loading: "Moving feed…",
      success: folderId ? "Feed moved to folder" : "Feed removed from folder",
      error: (error) => (error instanceof Error ? error.message : "Failed to move feed"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to move feed");
    }
  };

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const expandFolder = (folderId: string) => {
    setCollapsedFolders((prev) => {
      if (!prev.has(folderId)) return prev;
      const next = new Set(prev);
      next.delete(folderId);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDragFeedId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragFeedId(null);
    const { active, over } = event;
    if (!over) return;
    const target = over.data.current as DropTargetData | undefined;
    if (!target || (target.folderId !== null && typeof target.folderId !== "string")) return;
    const feed = feeds.find((f) => f.id === active.id);
    if (!feed) return;
    const nextFolderId = target.folderId;
    if ((feed.folderId ?? null) === nextFolderId) return;
    moveFeed(feed.id, nextFolderId);
    if (nextFolderId) expandFolder(nextFolderId);
  };

  const handleDragCancel = () => {
    setDragFeedId(null);
  };

  const activeFeed = feeds.find((f) => f.id === activeFeedId) ?? null;
  const activeFolder = folders.find((f) => f.id === activeFolderId) ?? null;
  const dragFeed = dragFeedId ? (feeds.find((f) => f.id === dragFeedId) ?? null) : null;
  const feedsByFolder = new Map<string, Feed[]>();
  const ungroupedFeeds: Feed[] = [];
  for (const f of feeds) {
    if (f.folderId) {
      const list = feedsByFolder.get(f.folderId) ?? [];
      list.push(f);
      feedsByFolder.set(f.folderId, list);
    } else {
      ungroupedFeeds.push(f);
    }
  }

  const feedHref = (f: Feed) =>
    query
      ? `/feed/${f.id}?filter=${effectiveFilter}&q=${encodeURIComponent(query)}`
      : `/feed/${f.id}?filter=${effectiveFilter}`;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <div className="flex h-full flex-col">
      <div className="p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#817c73]">Your reading desk</p>
        <form onSubmit={addFeed} className="mt-3">
          <label htmlFor="feed-url" className="mb-1.5 block text-[13px] font-medium">
            Follow a new feed
          </label>
          <div className="flex gap-2">
            <input
              id="feed-url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="min-w-0 flex-1 rounded-[3px] border border-[#c8c1b5] bg-black px-2.5 py-2 text-[13px] outline-none placeholder:text-[#817c73] focus:border-white"
            />
            <button
              disabled={loading}
              className="inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-[#fafafa] px-3 py-2 text-[13px] font-medium text-black transition hover:bg-[#e5e5e5] active:scale-[0.98] disabled:opacity-50"
            >
              <Plus size={13} weight="bold" /> Add
            </button>
          </div>
          <p className="mt-1.5 text-xs text-[#787774]">Paste any RSS or Atom URL.</p>
        </form>

        <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Article filter">
          {FILTERS.map((f) =>
            scopedId ? (
              <button
                key={f}
                role="tab"
                aria-selected={effectiveFilter === f}
                onClick={() => {
                  // Close the open reader: otherwise ?article= survives the
                  // filter change and the old article stays open.
                  setArticleId(null);
                  setFeedFilter(f);
                  onNavigate?.();
                }}
                className={`rounded-[3px] border px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] transition active:scale-[0.98] ${
                  effectiveFilter === f
                    ? "border-white bg-[#fafafa] font-semibold text-black"
                    : "border-white/15 bg-transparent text-[#a3a3a3] hover:border-white/40 hover:text-white"
                }`}
              >
                {f}
              </button>
            ) : (
              <Link
                key={f}
                href={filterHref(f, query)}
                role="tab"
                aria-selected={effectiveFilter === f}
                aria-current={effectiveFilter === f ? "page" : undefined}
                onClick={onNavigate}
                className={`rounded-[3px] border px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] transition active:scale-[0.98] ${
                  effectiveFilter === f
                    ? "border-white bg-[#fafafa] font-semibold text-black"
                    : "border-white/15 bg-transparent text-[#a3a3a3] hover:border-white/40 hover:text-white"
                }`}
              >
                {f}
              </Link>
            ),
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <Link
          href={filterHref(effectiveFilter, query)}
          onClick={onNavigate}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
            scopedId === null
              ? "border border-white/20 bg-[#141414] font-medium text-white shadow-[inset_2px_0_0_#fafafa]"
              : "border border-transparent text-[#8a8a8a] hover:bg-[#141414] hover:text-white"
          }`}
        >
          <span className="min-w-0 flex-1 truncate">All feeds</span>
          {totalUnread > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-[#e5e5e5]">
              {totalUnread}
            </span>
          )}
        </Link>
        {folderFormOpen ? (
          <form onSubmit={createFolder} className="mt-1 flex gap-1.5 px-1">
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              aria-label="Folder name"
              className="min-w-0 flex-1 rounded-[3px] border border-[#c8c1b5] bg-black px-2.5 py-1.5 text-[13px] outline-none placeholder:text-[#817c73] focus:border-white"
            />
            <button
              disabled={loading}
              className="inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-[#fafafa] px-2.5 py-1.5 text-[13px] font-medium text-black transition hover:bg-[#e5e5e5] active:scale-[0.98] disabled:opacity-50"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            onClick={() => setFolderFormOpen(true)}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs text-[#817c73] transition hover:bg-[#141414] hover:text-white active:scale-[0.98]"
          >
            <FolderPlus size={13} weight="bold" /> New folder
          </button>
        )}
        {folders.map((folder) => {
          const active = activeFolderId === folder.id;
          const isCollapsed = collapsedFolders.has(folder.id);
          const folderFeeds = feedsByFolder.get(folder.id) ?? [];
          const href = query
            ? `/folder/${folder.id}?filter=${effectiveFilter}&q=${encodeURIComponent(query)}`
            : `/folder/${folder.id}?filter=${effectiveFilter}`;
          return (
            <DropZone key={folder.id} id={folder.id} folderId={folder.id} className="mt-2">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleFolderCollapsed(folder.id)}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} folder ${folder.name}`}
                  className="shrink-0 rounded p-1 text-[#817c73] transition hover:text-white"
                >
                  <CaretRight
                    size={11}
                    weight="bold"
                    className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                  />
                </button>
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={`${feedLinkCls(active)} mt-0`}
                >
                  <Folder size={13} weight={active ? "fill" : "bold"} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  {folder.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-[#e5e5e5]">
                      {folder.unreadCount}
                    </span>
                  )}
                </Link>
              </div>
              {!isCollapsed &&
                folderFeeds.map((f) => (
                  <FeedLink
                    key={f.id}
                    feed={f}
                    href={feedHref(f)}
                    nested
                    active={activeFeedId === f.id}
                    onNavigate={onNavigate}
                  />
                ))}
              {!isCollapsed && folderFeeds.length === 0 && (
                <p className="ml-4 px-3 py-1.5 text-xs text-[#787774]">
                  No feeds here yet. Drag a feed here to file it.
                </p>
              )}
            </DropZone>
          );
        })}
        <DropZone
          id={UNGROUPED_DROP_ID}
          folderId={null}
          className={folders.length > 0 ? "mt-3" : ""}
        >
          {folders.length > 0 && (ungroupedFeeds.length > 0 || dragFeedId) && (
            <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#817c73]">
              Ungrouped
            </p>
          )}
          {ungroupedFeeds.map((f) => (
            <FeedLink
              key={f.id}
              feed={f}
              href={feedHref(f)}
              nested={false}
              active={activeFeedId === f.id}
              onNavigate={onNavigate}
            />
          ))}
          {folders.length > 0 && ungroupedFeeds.length === 0 && dragFeedId && (
            <p className="px-3 py-2 text-xs text-[#787774]">Drop here to move out of the folder.</p>
          )}
        </DropZone>
        {feeds.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-4 text-[13px] text-[#787774]">
            No feeds yet. Add your first feed above to start a quiet reading list.
          </div>
        )}
      </div>

      {activeFeedId && activeFeed && (
        <div className="border-t border-white/10 p-3">
          <p className="mb-2 truncate px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#787774]">
            {activeFeed.title}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => refreshFeed(activeFeedId)}
              className="flex-1 rounded-[6px] border border-white/10 bg-transparent px-2 py-1.5 text-xs transition hover:bg-white/5 active:scale-[0.98]"
            >
              Refresh
            </button>
            <button
              onClick={() => markAllRead(activeFeedId)}
              title="Mark all read"
              className="flex flex-1 items-center justify-center gap-1 rounded-[6px] border border-white/10 bg-transparent px-2 py-1.5 text-xs transition hover:bg-white/5 active:scale-[0.98]"
            >
              <Checks size={13} weight="bold" /> Read
            </button>
            <button
              onClick={() => removeFeed(activeFeedId)}
              title="Remove feed"
              className="inline-flex items-center gap-1 rounded-[6px] border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-[#d4d4d4] transition hover:bg-white/10 active:scale-[0.98]"
            >
              <Trash size={13} weight="bold" />
            </button>
          </div>
          {folders.length > 0 && (
            <select
              value={activeFeed.folderId ?? ""}
              onChange={(e) => moveFeed(activeFeedId, e.target.value || null)}
              aria-label="Move feed to folder"
              className="mt-1.5 w-full rounded-[6px] border border-white/10 bg-transparent px-2 py-1.5 text-xs text-[#d4d4d4] outline-none transition hover:bg-white/5 [&>option]:bg-[#141414]"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {activeFolderId && activeFolder && (
        <div className="border-t border-white/10 p-3">
          {renamingFolder ? (
            <form onSubmit={renameFolder} className="mb-2 flex gap-1.5">
              <input
                autoFocus
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                aria-label="New folder name"
                className="min-w-0 flex-1 rounded-[3px] border border-[#c8c1b5] bg-black px-2.5 py-1.5 text-[13px] outline-none placeholder:text-[#817c73] focus:border-white"
              />
              <button
                disabled={loading}
                className="inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-[#fafafa] px-2.5 py-1.5 text-[13px] font-medium text-black transition hover:bg-[#e5e5e5] active:scale-[0.98] disabled:opacity-50"
              >
                Save
              </button>
            </form>
          ) : (
            <p className="mb-2 truncate px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#787774]">
              {activeFolder.name}
            </p>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                setRenameName(activeFolder.name);
                setRenamingFolder((v) => !v);
              }}
              className="flex-1 rounded-[6px] border border-white/10 bg-transparent px-2 py-1.5 text-xs transition hover:bg-white/5 active:scale-[0.98]"
            >
              Rename
            </button>
            <button
              onClick={() => markFolderRead(activeFolderId)}
              title="Mark all read"
              className="flex flex-1 items-center justify-center gap-1 rounded-[6px] border border-white/10 bg-transparent px-2 py-1.5 text-xs transition hover:bg-white/5 active:scale-[0.98]"
            >
              <Checks size={13} weight="bold" /> Read
            </button>
            <button
              onClick={() => removeFolder(activeFolderId)}
              title="Delete folder"
              className="inline-flex items-center gap-1 rounded-[6px] border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-[#d4d4d4] transition hover:bg-white/10 active:scale-[0.98]"
            >
              <Trash size={13} weight="bold" />
            </button>
          </div>
        </div>
      )}
    </div>
    <DragOverlay dropAnimation={null}>
      {dragFeed ? (
        <div className="pointer-events-none flex w-56 items-center gap-2 rounded-lg border border-white/20 bg-[#141414] px-3 py-2 text-sm text-white shadow-xl">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${dragFeed.unreadCount > 0 ? "bg-white" : "bg-white/15"}`}
          />
          <span className="min-w-0 flex-1 truncate">{dragFeed.title}</span>
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}
