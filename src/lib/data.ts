import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { ON_TIME_WINDOW_MS } from "./dates";
import { db } from "./firebase";
import type { Track } from "./types";

export const MAX_GROUP_SIZE = 30;

export function createProfile(uid: string, name: string) {
  return setDoc(doc(db, "users", uid), { name: name.trim(), createdAt: serverTimestamp() });
}

export async function createGroup(uid: string, name: string): Promise<string> {
  const ref = await addDoc(collection(db, "groups"), { name: name.trim(), ownerId: uid, memberIds: [uid] });
  return ref.id;
}

export function joinGroup(gid: string, uid: string) {
  return updateDoc(doc(db, "groups", gid), { memberIds: arrayUnion(uid) });
}

/** Leave a group, or (owner only) remove someone else from it. */
export function removeFromGroup(gid: string, uid: string) {
  return updateDoc(doc(db, "groups", gid), { memberIds: arrayRemove(uid) });
}

/**
 * Posts today's track and the matching presence marker in one batch.
 * `late` must match the server clock, so a write rejected right at the one-hour mark is retried once flipped.
 */
export async function postTrack(date: string, uid: string, track: Track, dropAt: Date) {
  const write = (late: boolean) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "days", date, "posts", uid), { track, postedAt: serverTimestamp(), late });
    batch.set(doc(db, "days", date, "presence", uid), { postedAt: serverTimestamp(), late });
    return batch.commit();
  };
  const late = Date.now() > dropAt.getTime() + ON_TIME_WINDOW_MS;
  try {
    await write(late);
  } catch (error) {
    // Near the one-hour mark the device clock can disagree with the server's: try the other flag once.
    if ((error as { code?: string }).code !== "permission-denied") throw error;
    await write(!late);
  }
}

export function castVote(gid: string, date: string, uid: string, postUid: string) {
  return setDoc(doc(db, "groups", gid, "days", date, "votes", uid), { postUid, updatedAt: serverTimestamp() });
}

export function removeVote(gid: string, date: string, uid: string) {
  return deleteDoc(doc(db, "groups", gid, "days", date, "votes", uid));
}

export function savePushToken(uid: string, token: string) {
  return setDoc(doc(db, "pushTokens", uid), { token, updatedAt: serverTimestamp() });
}

/** Account deletion: leave or delete groups, then drop profile and push token. Posts stay (immutable by rules). */
export async function deleteMyData(uid: string) {
  const groups = await getDocs(query(collection(db, "groups"), where("memberIds", "array-contains", uid)));
  for (const group of groups.docs) {
    if (group.get("ownerId") === uid) await deleteDoc(group.ref);
    else await removeFromGroup(group.id, uid);
  }
  await deleteDoc(doc(db, "pushTokens", uid));
  await deleteDoc(doc(db, "users", uid));
}
