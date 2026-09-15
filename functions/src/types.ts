import type { Timestamp } from "firebase-admin/firestore";

export type DayStatus = "pending" | "live" | "closed";

export interface Track {
  deezerId: number;
  title: string;
  artist: string;
  cover: string;
}

export interface DayDoc {
  theme: string;
  dropAt: Timestamp;
  status: DayStatus;
  remindedAt?: Timestamp;
  resultsSentAt?: Timestamp;
}

export interface PostDoc {
  track: Track;
  postedAt: Timestamp;
  late: boolean;
}

export interface GroupDoc {
  name: string;
  ownerId: string;
  memberIds: string[];
}

export interface VoteDoc {
  postUid: string;
  updatedAt: Timestamp;
}

export interface PlaylistEntryDoc {
  date: string;
  theme: string;
  winnerUid: string;
  winnerName: string;
  track: Track;
  votes: number;
}
