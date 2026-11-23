import type { FeedPost } from "@/lib/studio/feed-types";
import { readScoutSnapshot } from "@/lib/studio/scout-snapshot-store";

/** Last known snapshot for feed (no Apify). */
export function getScoutCompetitorsForFeed(moduleId: string): FeedPost[] {
  return readScoutSnapshot(moduleId)?.competitors ?? [];
}
