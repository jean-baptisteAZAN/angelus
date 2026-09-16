import type { Track } from "./types";

export interface SearchResult extends Track {
  preview: string;
}

interface DeezerTrack {
  id: number;
  title: string;
  readable?: boolean;
  preview: string;
  artist: { name: string };
  album: { cover_medium: string };
}

interface DeezerSearchResponse {
  data?: DeezerTrack[];
  error?: { message: string };
}

const API = "https://api.deezer.com";

export async function searchTracks(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const response = await fetch(`${API}/search?limit=25&q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error(`Deezer search failed: ${response.status}`);
  const json = (await response.json()) as DeezerSearchResponse;
  if (json.error || !json.data) throw new Error(json.error?.message ?? "Deezer search failed");
  return json.data
    .filter((t) => t.readable !== false && t.preview)
    .map((t) => ({
      deezerId: t.id,
      title: t.title,
      artist: t.artist.name,
      cover: t.album.cover_medium,
      preview: t.preview,
    }));
}

/** Preview URLs expire, so they are fetched again right before playing. */
export async function fetchPreviewUrl(deezerId: number): Promise<string | null> {
  const response = await fetch(`${API}/track/${deezerId}`);
  if (!response.ok) return null;
  const json = (await response.json()) as Partial<DeezerTrack>;
  return json.preview || null;
}
