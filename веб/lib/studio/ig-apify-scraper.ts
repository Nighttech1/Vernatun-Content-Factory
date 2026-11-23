// Map historical Instagram snapshots for the Studio feed.
import type { FeedPost } from "@/lib/studio/feed-types";

/** Raw Apify dataset item (defensive — schema may drift). */
export type ApifyIgItem = {
  id?: string | number;
  shortCode?: string;
  type?: string;
  productType?: string;
  caption?: string;
  displayUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  childPosts?: Array<{
    displayUrl?: string;
    thumbnailUrl?: string;
    videoUrl?: string;
  }>;
  images?: string[];
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  ownerUsername?: string;
  owner?: { username?: string; followersCount?: number };
  /** S49 — profile followers when actor returns them */
  followersCount?: number;
  ownerFollowersCount?: number;
  url?: string;
  /** Actor error row (empty/private hashtag) — skip. */
  error?: string;
  errorDescription?: string;
};

function titleFromCaption(caption: string | undefined, fallbackId: string): string {
  const raw = (caption ?? "").trim();
  if (!raw) return `IG post ${fallbackId}`;
  const firstLine = raw.split(/\r?\n/)[0]?.trim() || raw;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function viewsFromItem(item: ApifyIgItem): number {
  return num(item.videoViewCount) || num(item.videoPlayCount) || 0;
}

export function popularityScore(item: ApifyIgItem): number {
  return num(item.likesCount) + num(item.commentsCount) + viewsFromItem(item);
}

export function popularityScorePost(p: FeedPost): number {
  return (
    (Number(p.metrics.likes) || 0) +
    (Number(p.metrics.comments) || 0) +
    (Number(p.metrics.views) || 0)
  );
}

function normalizeTypeHint(item: ApifyIgItem): string {
  return `${item.type ?? ""} ${item.productType ?? ""}`.toLowerCase();
}

/**
 * D4: Sidecar / multi children → CAROUSEL; Video/Reel/Clips → VIDEO; else IMAGE.
 */
export function mapApifyMediaType(
  item: ApifyIgItem,
): "CAROUSEL_ALBUM" | "IMAGE" | "VIDEO" {
  const children = Array.isArray(item.childPosts) ? item.childPosts : [];
  const hint = normalizeTypeHint(item);

  if (
    hint.includes("sidecar") ||
    children.length > 1 ||
    (Array.isArray(item.images) && item.images.length > 1)
  ) {
    return "CAROUSEL_ALBUM";
  }

  if (
    hint.includes("video") ||
    hint.includes("reel") ||
    hint.includes("clips") ||
    Boolean(item.videoUrl)
  ) {
    return "VIDEO";
  }

  return "IMAGE";
}

function slideUrlsFromItem(item: ApifyIgItem): string[] | undefined {
  const children = Array.isArray(item.childPosts) ? item.childPosts : [];
  if (children.length > 0) {
    const urls = children
      .map((c) => c.displayUrl || c.thumbnailUrl || c.videoUrl)
      .filter((u): u is string => Boolean(u));
    if (urls.length > 0) return urls;
  }
  if (Array.isArray(item.images) && item.images.length > 0) {
    const imgs = item.images.filter(Boolean);
    if (imgs.length > 0) return imgs;
  }
  // S50 — live cards need at least cover URL for Razbor/Create L/R
  const cover = item.displayUrl || item.thumbnailUrl || item.videoUrl;
  return cover ? [cover] : undefined;
}

/**
 * Map one Apify dataset item → competitor FeedPost (or null if no id).
 */
export function mapApifyItemToFeedPost(item: ApifyIgItem): FeedPost | null {
  if (item.error) return null;

  const externalId = String(item.id ?? item.shortCode ?? "").trim();
  if (!externalId) return null;

  const mediaType = mapApifyMediaType(item);
  const thumbUrl =
    item.thumbnailUrl || item.displayUrl || item.videoUrl || undefined;
  /** S50 — always attach slideUrls for carousels (and multi-image) when API has them. */
  const slideUrls =
    mediaType === "CAROUSEL_ALBUM" || mediaType === "IMAGE"
      ? slideUrlsFromItem(item)
      : undefined;

  const username =
    (item.ownerUsername ?? item.owner?.username ?? "")
      .trim()
      .replace(/^@/, "") || undefined;

  const followersRaw =
    num(item.followersCount) ||
    num(item.ownerFollowersCount) ||
    num(item.owner?.followersCount) ||
    0;

  return {
    id: `ig-competitor-${externalId}`,
    source: "competitor",
    title: titleFromCaption(item.caption, externalId),
    thumbUrl,
    mediaUrl: mediaType === "VIDEO" ? item.videoUrl || undefined : undefined,
    metrics: {
      likes: num(item.likesCount),
      comments: num(item.commentsCount),
      views: viewsFromItem(item),
    },
    sourceMode: "live",
    username,
    /** S49 — plaque `name | Nк`; fixtures fill if missing */
    ...(followersRaw > 0 ? { followers: followersRaw } : {}),
    externalId,
    permalink: item.url || undefined,
    mediaType,
    slideUrls,
  };
}

/** Map + sort by popularity desc (D3). */
export function mapApifyDatasetToFeedPosts(items: ApifyIgItem[]): FeedPost[] {
  const scored = items
    .map((item) => ({ item, score: popularityScore(item) }))
    .sort((a, b) => b.score - a.score);

  const byId = new Map<string, FeedPost>();
  for (const { item } of scored) {
    const post = mapApifyItemToFeedPost(item);
    if (!post || !post.externalId) continue;
    if (!byId.has(post.externalId)) {
      byId.set(post.externalId, post);
    }
  }
  return [...byId.values()].sort(
    (a, b) => popularityScorePost(b) - popularityScorePost(a),
  );
}

/**
 * D4 module split:
 * - carousel-engine: CAROUSEL_ALBUM first, IMAGE backfill; no VIDEO
 * - custom-reels: VIDEO only
 */
export function filterCompetitorsForModule(
  moduleId: string,
  posts: FeedPost[],
): FeedPost[] {
  if (moduleId === "custom-reels") {
    return posts.filter((p) => p.mediaType === "VIDEO");
  }

  if (moduleId === "carousel-engine") {
    const carousels = posts.filter((p) => p.mediaType === "CAROUSEL_ALBUM");
    const images = posts.filter((p) => p.mediaType === "IMAGE");
    return [...carousels, ...images];
  }

  return posts;
}
