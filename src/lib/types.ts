import type { Timestamp } from "firebase/firestore";

export interface Track {
  deezerId: number;
  title: string;
  artist: string;
  cover: string;
}

export interface UserProfile {
  name: string;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
}

export type DayStatus = "live" | "closed";

export interface Day {
  date: string;
  theme: string;
  dropAt: Date;
  status: DayStatus;
}

export interface Post {
  uid: string;
  track: Track;
  postedAt: Date;
  late: boolean;
}

export interface Presence {
  uid: string;
  postedAt: Date;
  late: boolean;
}

export interface Vote {
  voterUid: string;
  postUid: string;
}

export interface PlaylistEntry {
  id: string;
  date: string;
  theme: string;
  winnerUid: string;
  winnerName: string;
  track: Track;
  votes: number;
}

export function toDate(value: Timestamp | null | undefined): Date {
  // serverTimestamp() fields are null in local snapshots until the server confirms them.
  return value ? value.toDate() : new Date();
}
