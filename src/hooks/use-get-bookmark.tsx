import React, { useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuthStore } from "@/store/auth-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const GET_BOOKMARKS_KEY = "GET_BOOKMARKS";
const GUEST_BOOKMARKS_KEY = "aniflix_guest_bookmarks";

type Props = {
  animeID?: string;
  status?: string;
  userId?: string;
  page?: number;
  per_page?: number;
  populate?: boolean;
};

export type Bookmark = {
  id: string;
  user: string;
  animeId: string;
  thumbnail: string;
  animeTitle: string;
  status: string;
  created: string;
  expand: { watchHistory: WatchHistory[] };
};

export type WatchHistory = {
  id: string;
  current: number;
  timestamp: number;
  episodeId?: string;
  episodeNumber: number;
  created: string;
};

function readGuestBookmarks(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_BOOKMARKS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGuestBookmarks(items: Bookmark[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(GUEST_BOOKMARKS_KEY, JSON.stringify(items));
  }
}

function filterGuestBookmarks(items: Bookmark[], animeID?: string, status?: string) {
  return items.filter((item) => {
    if (animeID && item.animeId !== animeID) return false;
    if (status) {
      const expected = status.toLowerCase().replace(/_/g, " ").trim();
      const actual = (item.status || "").toLowerCase().replace(/_/g, " ").trim();
      if (actual !== expected) return false;
    }
    return true;
  });
}

function guestToast(message: string, showToast: boolean, error = false) {
  if (showToast) {
    (error ? toast.error : toast.success)(message);
  }
}

function useBookMarks({
  animeID,
  status,
  userId,
  page = 1,
  per_page = 20,
  populate = true,
}: Props) {
  const { auth } = useAuthStore();
  const queryClient = useQueryClient();
  const targetUserId = userId || auth?.id || pb.authStore.record?.id;
  const filters: string[] = [];

  if (targetUserId) filters.push(`user='${targetUserId}'`);
  if (animeID) filters.push(`animeId='${animeID}'`);
  if (status) {
    const altStatus = status.includes("_")
      ? status.replace(/_/g, " ")
      : status.replace(/\s+/g, "_");
    filters.push(altStatus !== status
      ? `(status='${status}' || status='${altStatus}')`
      : `status='${status}'`);
  }

  const { data, isLoading } = useQuery({
    queryKey: [GET_BOOKMARKS_KEY, { animeID, status, page, per_page, userId: targetUserId || "guest" }],
    queryFn: async () => {
      if (!targetUserId) {
        const filtered = filterGuestBookmarks(readGuestBookmarks(), animeID, status);
        const start = Math.max(0, page - 1) * per_page;
        return {
          bookmarks: filtered.slice(start, start + per_page).length ? filtered.slice(start, start + per_page) : null,
          totalPages: Math.ceil(filtered.length / per_page),
          totalItems: filtered.length,
        };
      }
      const res = await pb.collection<Bookmark>("bookmarks").getList(page, per_page, {
        filter: filters.join(" && "),
        expand: "watchHistory",
        sort: "-updated",
        requestKey: null,
      });
      return { bookmarks: res.items.length ? res.items : null, totalPages: res.totalPages, totalItems: res.totalItems };
    },
    enabled: populate,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const bookmarks = data?.bookmarks ?? null;
  const totalPages = data?.totalPages ?? 0;

  const createOrUpdateBookMark = useCallback(
    async (
      targetAnimeID: string,
      animeTitle: string,
      animeThumbnail: string,
      targetStatus: string,
      showToast = true,
    ): Promise<string | null> => {
      const currentUserId = auth?.id || pb.authStore.record?.id;
      if (!targetAnimeID) return null;

      if (!currentUserId) {
        try {
          const records = readGuestBookmarks();
          const index = records.findIndex((item) => item.animeId === targetAnimeID);
          if (index >= 0) {
            if (records[index].status === targetStatus) {
              guestToast("Already in this list", showToast, true);
              return records[index].id;
            }
            records[index] = {
              ...records[index],
              animeTitle: animeTitle || records[index].animeTitle,
              thumbnail: animeThumbnail || records[index].thumbnail,
              status: targetStatus,
            };
            writeGuestBookmarks(records);
            guestToast("Successfully updated your list", showToast);
            queryClient.invalidateQueries({ queryKey: [GET_BOOKMARKS_KEY] });
            return records[index].id;
          }
          const created: Bookmark = {
            id: `guest-${targetAnimeID}`,
            user: "guest",
            animeId: targetAnimeID,
            animeTitle: animeTitle || "Anime",
            thumbnail: animeThumbnail || "",
            status: targetStatus,
            created: new Date().toISOString(),
            expand: { watchHistory: [] },
          };
          writeGuestBookmarks([created, ...records]);
          guestToast("Successfully added to your list", showToast);
          queryClient.invalidateQueries({ queryKey: [GET_BOOKMARKS_KEY] });
          return created.id;
        } catch (error) {
          console.error("Could not save guest anime list:", error);
          guestToast("Could not save on this device", showToast, true);
          return null;
        }
      }

      try {
        const res = await pb.collection<Bookmark>("bookmarks").getList(1, 1, {
          filter: `user='${currentUserId}' && animeId='${targetAnimeID}'`, requestKey: null,
        });
        let bookmarkId: string;
        if (res.totalItems > 0) {
          if (res.items[0].status === targetStatus) {
            if (showToast) toast.error("Already in this status", { style: { background: "red" } });
            return res.items[0].id;
          }
          const updated = await pb.collection("bookmarks").update(res.items[0].id, {
            status: targetStatus,
            ...(animeTitle ? { animeTitle } : {}),
            ...(animeThumbnail ? { thumbnail: animeThumbnail } : {}),
          }, { requestKey: null });
          if (showToast) toast.success("Successfully updated status", { style: { background: "green" } });
          bookmarkId = updated.id;
        } else {
          const created = await pb.collection<Bookmark>("bookmarks").create({
            user: currentUserId, animeId: targetAnimeID, animeTitle, thumbnail: animeThumbnail, status: targetStatus,
          }, { requestKey: null });
          if (showToast) toast.success("Successfully added to list", { style: { background: "green" } });
          bookmarkId = created.id;
        }
        queryClient.invalidateQueries({ queryKey: [GET_BOOKMARKS_KEY] });
        return bookmarkId;
      } catch (error) {
        console.error("Error creating/updating bookmark:", error);
        return null;
      }
    },
    [auth?.id, queryClient],
  );

  const syncWatchProgress = useCallback(
    async (
      bookmarkId: string | null,
      watchedRecordId: string | null,
      episodeData: { episodeId?: string; episodeNumber: number; current: number; duration: number },
    ): Promise<string | null> => {
      const currentUserId = auth?.id || pb.authStore.record?.id;
      if (!currentUserId && bookmarkId?.startsWith("guest-")) {
        const records = readGuestBookmarks();
        const bookmark = records.find((item) => item.id === bookmarkId);
        if (!bookmark) return watchedRecordId;
        const history = bookmark.expand?.watchHistory || [];
        const existing = history.find((item) => Number(item.episodeNumber) === Number(episodeData.episodeNumber));
        const recordId = existing?.id || `guest-${bookmark.animeId}-ep-${episodeData.episodeNumber}`;
        const entry: WatchHistory = {
          id: recordId,
          episodeId: episodeData.episodeId,
          episodeNumber: Number(episodeData.episodeNumber),
          current: Math.max(0, Math.round(episodeData.current)),
          timestamp: Math.max(0, Math.round(episodeData.duration)),
          created: existing?.created || new Date().toISOString(),
        };
        bookmark.expand = { watchHistory: existing
          ? history.map((item) => item.id === existing.id ? entry : item)
          : [...history, entry] };
        writeGuestBookmarks(records);
        queryClient.invalidateQueries({ queryKey: [GET_BOOKMARKS_KEY] });
        return recordId;
      }

      const isAuthenticated = pb.authStore.isValid || Boolean(auth?.id);
      if (!isAuthenticated || !bookmarkId) return watchedRecordId;
      const dataToSave: Record<string, any> = {
        episodeNumber: episodeData.episodeNumber,
        current: Math.round(episodeData.current),
        timestamp: Math.round(episodeData.duration),
      };
      if (episodeData.episodeId) dataToSave.episodeId = episodeData.episodeId;
      try {
        let targetRecordId = watchedRecordId;
        if (!targetRecordId) {
          try {
            const bookmarkRecord = await pb.collection<Bookmark>("bookmarks").getOne(bookmarkId, { expand: "watchHistory", requestKey: null });
            const existingEpRecord = (bookmarkRecord.expand?.watchHistory || []).find((w) => Number(w.episodeNumber) === Number(episodeData.episodeNumber));
            if (existingEpRecord) targetRecordId = existingEpRecord.id;
          } catch (error) {
            console.warn("Could not check existing watch history:", error);
          }
        }
        if (targetRecordId) {
          await pb.collection("watched").update(targetRecordId, dataToSave, { requestKey: null });
          queryClient.invalidateQueries({ queryKey: [GET_BOOKMARKS_KEY] });
          return targetRecordId;
        }
        const newWatchedRecord = await pb.collection("watched").create(dataToSave, { requestKey: null });
        try {
          await pb.collection("bookmarks").update(bookmarkId, { "watchHistory+": newWatchedRecord.id }, { requestKey: null });
          queryClient.invalidateQueries({ queryKey: [GET_BOOKMARKS_KEY] });
          return newWatchedRecord.id;
        } catch (error) {
          console.error("Error updating bookmark with new watch record:", error);
          return null;
        }
      } catch (error) {
        console.error("Error syncing watch progress:", error);
        return watchedRecordId;
      }
    },
    [auth?.id, queryClient],
  );

  return { bookmarks, syncWatchProgress, createOrUpdateBookMark, totalPages, isLoading };
}

export default useBookMarks;
