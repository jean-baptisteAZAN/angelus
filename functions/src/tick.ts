import { Timestamp, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { parisDateKey, previousDateKey } from "./dates.js";
import { dropMessage, reminderMessage, resultsMessage, type PushPayload } from "./messages.js";
import type { PushTarget, SendPush } from "./push.js";
import { decideActions, pickDropAt, type Action, type DayState } from "./schedule.js";
import { pickFallbackTheme } from "./theme.js";
import type { DayDoc, GroupDoc, PlaylistEntryDoc, PostDoc, VoteDoc } from "./types.js";
import { computeWinners } from "./winners.js";

export interface TickDeps {
  db: Firestore;
  now: Date;
  random: () => number;
  generateTheme: (recentThemes: string[]) => Promise<string | null>;
  sendPush: SendPush;
}

export async function runTick(deps: TickDeps): Promise<Action[]> {
  const { db, now } = deps;
  const todayKey = parisDateKey(now);
  const [todaySnap, yesterdaySnap, openSnap] = await Promise.all([
    db.doc(`days/${todayKey}`).get(),
    db.doc(`days/${previousDateKey(todayKey)}`).get(),
    db.collection("days").where("status", "in", ["pending", "live"]).get(),
  ]);

  const actions = decideActions({
    now,
    todayKey,
    today: toDayState(todaySnap),
    yesterday: toDayState(yesterdaySnap),
    unclosedPastKeys: openSnap.docs.map((d) => d.id).filter((id) => id < todayKey).sort(),
  });

  for (const action of actions) {
    try {
      await runAction(deps, action);
    } catch (error) {
      logger.error("tick action failed", { action, error: String(error) });
    }
  }
  return actions;
}

function toDayState(snap: DocumentSnapshot): DayState | null {
  if (!snap.exists) return null;
  const day = snap.data() as DayDoc;
  return {
    date: snap.id,
    status: day.status,
    dropAt: day.dropAt.toDate(),
    remindedAt: day.remindedAt?.toDate() ?? null,
    resultsSentAt: day.resultsSentAt?.toDate() ?? null,
  };
}

function runAction(deps: TickDeps, action: Action): Promise<void> {
  switch (action.type) {
    case "close":
      return closeDay(deps, action.date);
    case "create":
      return createDay(deps, action.date);
    case "drop":
      return dropDay(deps, action.date);
    case "remind":
      return remindDay(deps, action.date);
    case "results":
      return sendResults(deps, action.date);
  }
}

async function closeDay({ db }: TickDeps, date: string): Promise<void> {
  const dayRef = db.doc(`days/${date}`);
  const [daySnap, postsSnap, groupsSnap] = await Promise.all([
    dayRef.get(),
    dayRef.collection("posts").get(),
    db.collection("groups").get(),
  ]);
  const day = daySnap.data() as DayDoc;
  const posts = new Map(postsSnap.docs.map((d) => [d.id, d.data() as PostDoc]));
  const batch = db.batch();

  for (const groupSnap of groupsSnap.docs) {
    const group = groupSnap.data() as GroupDoc;
    const eligibleUids = new Set(group.memberIds.filter((uid) => posts.has(uid)));
    const votesSnap = await groupSnap.ref.collection("days").doc(date).collection("votes").get();
    const votes = votesSnap.docs.map((d) => ({ voterUid: d.id, postUid: (d.data() as VoteDoc).postUid }));

    for (const winner of computeWinners(votes, eligibleUids)) {
      const entry: PlaylistEntryDoc = {
        date,
        theme: day.theme,
        winnerUid: winner.postUid,
        winnerName: await userName(db, winner.postUid),
        track: posts.get(winner.postUid)!.track,
        votes: winner.votes,
      };
      batch.set(groupSnap.ref.collection("playlist").doc(`${date}_${winner.postUid}`), entry);
    }
  }

  batch.update(dayRef, { status: "closed" });
  await batch.commit();
}

async function createDay({ db, random, generateTheme }: TickDeps, date: string): Promise<void> {
  const recentSnap = await db.collection("days").orderBy("dropAt", "desc").limit(60).get();
  const recentThemes = recentSnap.docs.map((d) => (d.data() as DayDoc).theme);
  const theme = (await generateTheme(recentThemes)) ?? pickFallbackTheme(recentThemes, random);
  const day: DayDoc = {
    theme,
    dropAt: Timestamp.fromDate(pickDropAt(date, random)),
    status: "pending",
  };
  await db.doc(`days/${date}`).create(day);
}

async function dropDay(deps: TickDeps, date: string): Promise<void> {
  const dayRef = deps.db.doc(`days/${date}`);
  const day = (await dayRef.get()).data() as DayDoc;
  await dayRef.update({ status: "live" });
  await send(deps, await allPushTargets(deps.db), dropMessage(day.theme));
}

async function remindDay(deps: TickDeps, date: string): Promise<void> {
  const dayRef = deps.db.doc(`days/${date}`);
  await dayRef.update({ remindedAt: Timestamp.fromDate(deps.now) });
  const posted = new Set((await dayRef.collection("posts").get()).docs.map((d) => d.id));
  const targets = (await allPushTargets(deps.db)).filter((t) => !posted.has(t.uid));
  await send(deps, targets, reminderMessage());
}

async function sendResults(deps: TickDeps, date: string): Promise<void> {
  const { db } = deps;
  await db.doc(`days/${date}`).update({ resultsSentAt: Timestamp.fromDate(deps.now) });
  const [groupsSnap, targets] = await Promise.all([db.collection("groups").get(), allPushTargets(db)]);

  for (const groupSnap of groupsSnap.docs) {
    const group = groupSnap.data() as GroupDoc;
    const entriesSnap = await groupSnap.ref.collection("playlist").where("date", "==", date).get();
    if (entriesSnap.empty) continue;
    const winners = entriesSnap.docs.map((d) => {
      const entry = d.data() as PlaylistEntryDoc;
      return { name: entry.winnerName, title: entry.track.title };
    });
    const members = new Set(group.memberIds);
    await send(deps, targets.filter((t) => members.has(t.uid)), resultsMessage(group.name, winners));
  }
}

async function allPushTargets(db: Firestore): Promise<PushTarget[]> {
  const snap = await db.collection("pushTokens").get();
  return snap.docs.map((d) => ({ uid: d.id, token: d.get("token") as string }));
}

async function send({ db, sendPush }: TickDeps, targets: PushTarget[], payload: PushPayload): Promise<void> {
  if (targets.length === 0) return;
  const deadUids = await sendPush(targets, payload);
  await Promise.all(deadUids.map((uid) => db.doc(`pushTokens/${uid}`).delete()));
}

async function userName(db: Firestore, uid: string): Promise<string> {
  const snap = await db.doc(`users/${uid}`).get();
  return (snap.get("name") as string | undefined) ?? "Quelqu'un";
}
