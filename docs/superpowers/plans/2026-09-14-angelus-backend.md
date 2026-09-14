# Angelus backend — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** construire et déployer le backend d'Angelus : règles Firestore et fonction planifiée `tick`, qui crée le thème du jour, fait le drop, envoie le rappel, clôt les votes et annonce les résultats.

**Architecture :**
- Aucune fonction serveur appelable par l'app : elle écrit directement dans Firestore, et les règles de sécurité font la police.
- Une seule Cloud Function planifiée, `tick`, tourne toutes les 15 min en heure de Paris. Elle lit l'état de la journée et une fonction pure (`decideActions`) décide quoi faire. Les effets (Firestore, Gemini, push Expo) sont passés en paramètres de `runTick`.

**Tech Stack :**
- Firebase : Firestore, Cloud Functions 2e génération (`firebase-functions` 7.3.2, `firebase-admin` 14.4.0), runtime Node 22.
- TypeScript 6, en modules ESM.
- `@google/genai` 2.22 (Gemini) et `expo-server-sdk` 7.2 (push).

**Spec :** `docs/superpowers/specs/2026-09-14-angelus-design.md`. Sections implémentées : §2 (règles du jeu), §5 (données), §6 (règles de sécurité), §7 (`tick`). Le client Expo fera l'objet d'un plan séparé.

## Global Constraints

- Tout le backend vit dans `functions/` (package npm séparé) plus `firebase.json`, `firestore.rules` et `firestore.indexes.json` à la racine. Ne pas toucher au code de l'app Expo, sauf l'exclusion de `functions` dans le `tsconfig.json` racine (tâche 1).
- **Modules** : `"type": "module"`, TypeScript `module`/`moduleResolution` = `NodeNext`. Les imports relatifs finissent en `.js` (`import { x } from "./dates.js"`).
- **Versions exactes** :
  - dépendances : `firebase-functions@7.3.2`, `firebase-admin@14.4.0`, `@google/genai@2.22.0`, `expo-server-sdk@7.2.0` ;
  - dev : `typescript@~6.0.3`.
- **Node** : Node 22 (runtime `nodejs22`). CLI Firebase globale `firebase` ≥ 15.
- **Temps** : fuseau unique `Europe/Paris`. Clé de journée : `YYYY-MM-DD` en heure de Paris. Créneaux de drop de 10:00 à 19:45, par pas de 15 min. Rappel à drop + 45 min, résultats à 09:00, « à l'heure » = drop + 1 h.
- **Projet** : aucun projet Firebase réel avant la tâche 2 (déploiement).
- **Textes des notifications** en français, exactement comme dans `functions/src/messages.ts`.
- **Pas de tests automatisés** (décision utilisateur) : la vérification se fait par compilation TypeScript, puis en production à la tâche 2.

---

### Task 1: Backend complet (config, règles, fonction `tick`)

Tout le code ci-dessous est à recopier **tel quel**. Il a déjà été compilé et validé.

**Files:**
- Create: `firebase.json`, `firestore.indexes.json`, `firestore.rules`
- Modify: `tsconfig.json` (racine : exclure `functions`), `.gitignore` (racine : artefacts Firebase)
- Create: `functions/package.json`, `functions/tsconfig.json`, `functions/.gitignore`
- Create: `functions/src/types.ts`, `functions/src/dates.ts`, `functions/src/schedule.ts`, `functions/src/winners.ts`, `functions/src/messages.ts`, `functions/src/theme.ts`, `functions/src/push.ts`, `functions/src/tick.ts`, `functions/src/index.ts`

**Interfaces :**
- Consomme : rien.
- Produit :
  - la Cloud Function `tick` (export de `functions/lib/index.js`) ;
  - les règles Firestore de la spec §6, dont dépendra l'app. Chemins et champs :
    - `users/{uid}` : `{ name, createdAt }` ;
    - `pushTokens/{uid}` : `{ token, updatedAt }` ;
    - `groups/{gid}` : `{ name, ownerId, memberIds }` ;
    - `groups/{gid}/playlist/{date}_{uid}` : `{ date, theme, winnerUid, winnerName, track, votes }` ;
    - `groups/{gid}/days/{date}/votes/{uid}` : `{ postUid, updatedAt }` ;
    - `days/{date}` : `{ theme, dropAt, status, remindedAt?, resultsSentAt? }` ;
    - `days/{date}/posts/{uid}` : `{ track: { deezerId, title, artist, cover }, postedAt, late }`.

- [ ] **Step 1 : Config Firebase racine**

`firebase.json` :

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs22",
      "ignore": ["node_modules", ".git", "test", "*.log"],
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
    }
  ],
  "emulators": {
    "firestore": { "port": 8080 },
    "ui": { "enabled": false }
  }
}
```

`firestore.indexes.json` (aucun index composite nécessaire) :

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 2 : Isoler `functions/` de l'app Expo**

Remplacer `tsconfig.json` (racine) par :

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  },
  "exclude": ["node_modules", "functions"]
}
```

Ajouter à la fin du `.gitignore` racine :

```gitignore

# Firebase
.firebase/
*-debug.log
.secret.local
```

- [ ] **Step 3 : Règles de sécurité**

`firestore.rules` :

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function isMe(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    function validName(name) {
      return name is string && name.size() > 0 && name.size() <= 30;
    }

    function dayData(date) {
      return get(/databases/$(database)/documents/days/$(date)).data;
    }

    function hasPostedOn(date, uid) {
      return exists(/databases/$(database)/documents/days/$(date)/posts/$(uid));
    }

    function validTrack(t) {
      return t is map
        && t.keys().hasOnly(['deezerId', 'title', 'artist', 'cover'])
        && t.keys().hasAll(['deezerId', 'title', 'artist', 'cover'])
        && t.deezerId is int
        && t.title is string && t.title.size() <= 200
        && t.artist is string && t.artist.size() <= 200
        && t.cover is string && t.cover.size() <= 500;
    }

    match /users/{uid} {
      allow read: if signedIn();
      allow create, update: if isMe(uid)
        && request.resource.data.keys().hasOnly(['name', 'createdAt'])
        && validName(request.resource.data.name);
      allow delete: if isMe(uid);
    }

    match /pushTokens/{uid} {
      allow read: if false;
      allow write: if isMe(uid);
    }

    match /groups/{gid} {
      function ownerUpdate() {
        return resource.data.ownerId == request.auth.uid
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'memberIds'])
          && validName(request.resource.data.name)
          && request.auth.uid in request.resource.data.memberIds
          && resource.data.memberIds.toSet().hasAll(request.resource.data.memberIds.toSet());
      }

      function joinSelf() {
        return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberIds'])
          && !(request.auth.uid in resource.data.memberIds)
          && request.resource.data.memberIds.size() == resource.data.memberIds.size() + 1
          && request.resource.data.memberIds.toSet() == resource.data.memberIds.toSet().union([request.auth.uid].toSet())
          && request.resource.data.memberIds.size() <= 30;
      }

      function leaveSelf() {
        return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberIds'])
          && request.auth.uid in resource.data.memberIds
          && request.auth.uid != resource.data.ownerId
          && request.resource.data.memberIds.size() == resource.data.memberIds.size() - 1
          && request.resource.data.memberIds.toSet() == resource.data.memberIds.toSet().difference([request.auth.uid].toSet());
      }

      allow get: if signedIn();
      allow list: if signedIn() && request.auth.uid in resource.data.memberIds;
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(['name', 'ownerId', 'memberIds'])
        && request.resource.data.ownerId == request.auth.uid
        && request.resource.data.memberIds == [request.auth.uid]
        && validName(request.resource.data.name);
      allow update: if signedIn() && (ownerUpdate() || joinSelf() || leaveSelf());
      allow delete: if signedIn() && resource.data.ownerId == request.auth.uid;

      function groupData() {
        return get(/databases/$(database)/documents/groups/$(gid)).data;
      }

      match /playlist/{entryId} {
        allow read: if signedIn() && request.auth.uid in groupData().memberIds;
        allow write: if false;
      }

      match /days/{date}/votes/{uid} {
        allow read: if signedIn() && request.auth.uid in groupData().memberIds;
        allow create, update: if isMe(uid)
          && request.resource.data.keys().hasOnly(['postUid', 'updatedAt'])
          && request.resource.data.updatedAt == request.time
          && request.resource.data.postUid is string
          && request.resource.data.postUid != uid
          && uid in groupData().memberIds
          && request.resource.data.postUid in groupData().memberIds
          && dayData(date).status == 'live'
          && hasPostedOn(date, uid)
          && hasPostedOn(date, request.resource.data.postUid);
        allow delete: if isMe(uid) && dayData(date).status == 'live';
      }
    }

    match /days/{date} {
      allow read: if signedIn() && resource.data.status != 'pending';
      allow write: if false;

      match /posts/{uid} {
        allow read: if signedIn() && hasPostedOn(date, request.auth.uid);
        allow create: if isMe(uid)
          && dayData(date).status == 'live'
          && request.resource.data.keys().hasOnly(['track', 'postedAt', 'late'])
          && request.resource.data.postedAt == request.time
          && request.resource.data.late == (request.time > dayData(date).dropAt + duration.value(1, 'h'))
          && validTrack(request.resource.data.track);
        allow update, delete: if false;
      }
    }
  }
}
```

- [ ] **Step 4 : Commit de la config**

```bash
git add firebase.json firestore.indexes.json firestore.rules tsconfig.json .gitignore
git commit -m "feat(firestore): add Firebase config and security rules"
```

- [ ] **Step 5 : Package `functions`**

`functions/package.json` :

```json
{
  "name": "angelus-functions",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "engines": {
    "node": "22"
  },
  "scripts": {
    "build": "tsc"
  }
}
```

`functions/tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

`functions/.gitignore` :

```gitignore
node_modules/
lib/
*.log
```

Installer (depuis `functions/`) :

```bash
cd functions
npm install firebase-functions@7.3.2 firebase-admin@14.4.0 @google/genai@2.22.0 expo-server-sdk@7.2.0
npm install -D typescript@~6.0.3
```

Attendu : `package.json` contient les 4 `dependencies` et `typescript` en `devDependencies`, et `package-lock.json` est créé.

- [ ] **Step 6 : Types et helpers de date**

`functions/src/types.ts` :

```ts
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
```

`functions/src/dates.ts` :

```ts
const TIME_ZONE = "Europe/Paris";

const dateKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Paris calendar date of an instant, as "YYYY-MM-DD". */
export function parisDateKey(instant: Date): string {
  return dateKeyFormat.format(instant);
}

export function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/** Instant at which Paris wall-clock time `minutesOfDay` occurs on `dateKey`. */
export function parisTimeToDate(dateKey: string, minutesOfDay: number): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 0, minutesOfDay);
  return new Date(guess - parisOffsetMinutes(new Date(guess)) * 60_000);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

function parisOffsetMinutes(instant: Date): number {
  const parts = Object.fromEntries(partsFormat.formatToParts(instant).map((p) => [p.type, p.value]));
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (wallClockAsUtc - instant.getTime()) / 60_000;
}
```

- [ ] **Step 7 : Décision du tick et tirage du créneau**

`functions/src/schedule.ts` :

```ts
import { addMinutes, parisTimeToDate } from "./dates.js";
import type { DayStatus } from "./types.js";

export const FIRST_DROP_MINUTE = 10 * 60;
export const LAST_DROP_MINUTE = 19 * 60 + 45;
export const SLOT_MINUTES = 15;
export const REMINDER_DELAY_MINUTES = 45;
export const RESULTS_MINUTE = 9 * 60;

export interface DayState {
  date: string;
  status: DayStatus;
  dropAt: Date;
  remindedAt: Date | null;
  resultsSentAt: Date | null;
}

export interface TickState {
  now: Date;
  todayKey: string;
  today: DayState | null;
  yesterday: DayState | null;
  unclosedPastKeys: string[];
}

export type Action =
  | { type: "close"; date: string }
  | { type: "create"; date: string }
  | { type: "drop"; date: string }
  | { type: "remind"; date: string }
  | { type: "results"; date: string };

export function pickDropAt(dateKey: string, random: () => number): Date {
  const slotCount = (LAST_DROP_MINUTE - FIRST_DROP_MINUTE) / SLOT_MINUTES + 1;
  const index = Math.min(Math.floor(random() * slotCount), slotCount - 1);
  return parisTimeToDate(dateKey, FIRST_DROP_MINUTE + index * SLOT_MINUTES);
}

export function decideActions(state: TickState): Action[] {
  const { now, todayKey, today, yesterday } = state;
  const actions: Action[] = state.unclosedPastKeys.map((date): Action => ({ type: "close", date }));

  if (!today) {
    actions.push({ type: "create", date: todayKey });
  } else if (today.status === "pending" && isAtOrAfter(now, today.dropAt)) {
    actions.push({ type: "drop", date: todayKey });
  } else if (
    today.status === "live" &&
    !today.remindedAt &&
    isAtOrAfter(now, addMinutes(today.dropAt, REMINDER_DELAY_MINUTES))
  ) {
    actions.push({ type: "remind", date: todayKey });
  }

  if (
    yesterday?.status === "closed" &&
    !yesterday.resultsSentAt &&
    isAtOrAfter(now, parisTimeToDate(todayKey, RESULTS_MINUTE))
  ) {
    actions.push({ type: "results", date: yesterday.date });
  }

  return actions;
}

function isAtOrAfter(instant: Date, reference: Date): boolean {
  return instant.getTime() >= reference.getTime();
}
```

- [ ] **Step 8 : Gagnants et textes des notifications**

`functions/src/winners.ts` :

```ts
export interface VoteInput {
  voterUid: string;
  postUid: string;
}

export interface Winner {
  postUid: string;
  votes: number;
}

/**
 * Winners of one group for one day. `eligibleUids` = group members who posted that day:
 * only their votes count, and only their posts can win. Ties all win; no votes, no winner.
 */
export function computeWinners(votes: VoteInput[], eligibleUids: ReadonlySet<string>): Winner[] {
  const counts = new Map<string, number>();
  for (const { voterUid, postUid } of votes) {
    if (voterUid === postUid || !eligibleUids.has(voterUid) || !eligibleUids.has(postUid)) continue;
    counts.set(postUid, (counts.get(postUid) ?? 0) + 1);
  }
  const best = Math.max(0, ...counts.values());
  if (best === 0) return [];
  return [...counts]
    .filter(([, count]) => count === best)
    .map(([postUid, count]) => ({ postUid, votes: count }))
    .sort((a, b) => a.postUid.localeCompare(b.postUid));
}
```

`functions/src/messages.ts` :

```ts
export interface PushPayload {
  title: string;
  body: string;
}

export function dropMessage(theme: string): PushPayload {
  return { title: "Angelus", body: `C'est l'heure. ${asSentence(theme)} Tu as 1 h pour poster.` };
}

export function reminderMessage(): PushPayload {
  return { title: "Angelus", body: "Plus que 15 min pour poster à l'heure." };
}

export function resultsMessage(groupName: string, winners: { name: string; title: string }[]): PushPayload {
  if (winners.length === 1) {
    const [winner] = winners;
    return { title: groupName, body: `${winner.name} gagne ${groupName} avec ${winner.title}.` };
  }
  const names = winners.map((w) => w.name);
  const list = `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
  return { title: groupName, body: `${list} gagnent ${groupName} ex æquo.` };
}

function asSentence(text: string): string {
  return /[.!?…]$/u.test(text) ? text : `${text}.`;
}
```

- [ ] **Step 9 : Thème (Gemini et secours) et push Expo**

`functions/src/theme.ts` :

```ts
import { GoogleGenAI } from "@google/genai";
import * as logger from "firebase-functions/logger";

export const GEMINI_MODEL = "gemini-3.8-flash";

export const FALLBACK_THEMES = [
  "Le son que ton chat écoute en cachette",
  "La musique d'attente de l'enfer",
  "Un son pour annoncer une rupture à ta plante",
  "Le générique de ta garde à vue",
  "Ce que chante ton frigo la nuit",
  "L'hymne officiel de ta procrastination",
  "Le slow de deux pigeons amoureux",
  "La musique qui passe dans la tête d'un rond-point",
  "Le son qu'écoute ta chaussette orpheline",
  "La bande-son de ton dernier bug en prod",
  "Le son pour réveiller un escargot en douceur",
  "La musique de fond d'un dîner de fantômes",
  "Le tube préféré de ta machine à laver",
  "Un son pour négocier avec un pigeon",
  "La chanson que fredonne ton GPS quand il se perd",
  "Le son d'entrée d'un catcheur à la retraite",
  "La musique d'ascenseur vers la lune",
  "Le son qui accompagne ta chute dans les escaliers",
  "La berceuse d'un dragon insomniaque",
  "Le son que ton voisin mérite à 7 h du matin",
  "La playlist secrète d'un radiateur",
  "Le son pour quitter une réunion qui aurait pu être un mail",
  "La musique d'un défilé de mode pour hamsters",
  "Le son qui passe quand tu retrouves un billet dans ta poche",
];

export function buildThemePrompt(recentThemes: string[]): string {
  const sections = [
    "Tu écris le thème du jour d'Angelus, une app où des amis partagent chaque jour une musique qui colle à un thème.",
    "Le ton est décalé et absurde, drôle sans être méchant, en français familier.",
    "Le thème décrit un son à trouver, en une phrase de 4 à 12 mots, sans point final.",
    "Exemples : « Le son que ton chat écoute en cachette », « La musique d'attente de l'enfer », « Un son pour annoncer une rupture à ta plante ».",
  ];
  if (recentThemes.length > 0) {
    sections.push(
      `Ne répète pas et ne paraphrase pas ces thèmes récents :\n${recentThemes.map((t) => `- ${t}`).join("\n")}`,
    );
  }
  sections.push('Réponds uniquement en JSON : {"theme": "..."}');
  return sections.join("\n\n");
}

export function parseThemeResponse(text: string | undefined): string | null {
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("theme" in parsed)) return null;
  const { theme } = parsed as { theme: unknown };
  if (typeof theme !== "string") return null;
  const cleaned = theme.trim().replace(/[.\s]+$/u, "");
  return cleaned.length >= 5 && cleaned.length <= 120 ? cleaned : null;
}

export function pickFallbackTheme(recentThemes: string[], random: () => number): string {
  const recent = new Set(recentThemes);
  const fresh = FALLBACK_THEMES.filter((theme) => !recent.has(theme));
  const pool = fresh.length > 0 ? fresh : FALLBACK_THEMES;
  return pool[Math.min(Math.floor(random() * pool.length), pool.length - 1)];
}

/** Asks Gemini for a new theme. Returns null on any failure so the caller can fall back. */
export async function generateTheme(apiKey: string, recentThemes: string[]): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildThemePrompt(recentThemes),
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: { theme: { type: "string" } },
          required: ["theme"],
        },
        temperature: 1.2,
      },
    });
    return parseThemeResponse(response.text);
  } catch (error) {
    logger.warn("Gemini theme generation failed", { error: String(error) });
    return null;
  }
}
```

`functions/src/push.ts` :

```ts
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import type { PushPayload } from "./messages.js";

export interface PushTarget {
  uid: string;
  token: string;
}

/** Sends one payload to many targets. Resolves with the uids whose token is dead. */
export type SendPush = (targets: PushTarget[], payload: PushPayload) => Promise<string[]>;

export interface ExpoClient {
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
}

export function createExpoSender(expo: ExpoClient = new Expo()): SendPush {
  return async (targets, payload) => {
    const valid = targets.filter((t) => Expo.isExpoPushToken(t.token));
    const deadUids = targets.filter((t) => !Expo.isExpoPushToken(t.token)).map((t) => t.uid);
    const messages: ExpoPushMessage[] = valid.map((t) => ({
      to: t.token,
      sound: "default",
      title: payload.title,
      body: payload.body,
    }));

    let offset = 0;
    for (const chunk of expo.chunkPushNotifications(messages)) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          deadUids.push(valid[offset + i].uid);
        }
      });
      offset += chunk.length;
    }
    return deadUids;
  };
}
```

- [ ] **Step 10 : Orchestration et fonction planifiée**

`functions/src/tick.ts` :

```ts
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
```

Note : les thèmes récents sont triés par `dropAt` décroissant. Trier par id de document en ordre décroissant échoue (« Firestore does not support descending key scans »).

`functions/src/index.ts` :

```ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/scheduler";
import { createExpoSender } from "./push.js";
import { generateTheme } from "./theme.js";
import { runTick } from "./tick.js";

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const tick = onSchedule(
  {
    schedule: "*/15 * * * *",
    timeZone: "Europe/Paris",
    region: "europe-west1",
    secrets: [geminiApiKey],
  },
  async () => {
    const actions = await runTick({
      db: getFirestore(),
      now: new Date(),
      random: Math.random,
      generateTheme: (recentThemes) => generateTheme(geminiApiKey.value(), recentThemes),
      sendPush: createExpoSender(),
    });
    logger.info("tick done", { actions });
  },
);
```

- [ ] **Step 11 : Vérifier la compilation et le chargement**

Run :

```bash
cd functions
npm run build
node -e "import('./lib/index.js').then((m) => console.log(Object.keys(m)))"
```

Expected : `tsc` sans erreur, puis la seconde commande affiche `[ 'tick' ]`.

- [ ] **Step 12 : Commit du code**

```bash
git add functions/package.json functions/package-lock.json functions/tsconfig.json functions/.gitignore functions/src
git commit -m "feat(functions): add scheduled daily tick"
```

---

### Task 2: Déploiement sur Firebase

Tâche **avec l'utilisateur** : les étapes 1 et 3 se font dans des consoles web, et le déploiement publie vers l'extérieur. Demander confirmation avant `firebase deploy`.

**Files:**
- Create: `.firebaserc` (généré par la CLI)

**Interfaces :**
- Consomme : tout ce qui précède.
- Produit : projet Firebase en ligne, avec règles, index et fonction `tick` déployés. L'id du projet sert au plan client.

- [ ] **Step 1 : Créer le projet (utilisateur, console Firebase)**

1. Créer un projet « angelus » sur https://console.firebase.google.com et noter son **project id**.
2. Passer le projet au **plan Blaze** (Utilisation et facturation).

- [ ] **Step 2 : Lier le repo au projet et créer la base**

```bash
firebase login
firebase use --add <PROJECT_ID>   # alias : default
firebase firestore:databases:create "(default)" --location=europe-west1
```

Expected : `.firebaserc` contient `"default": "<PROJECT_ID>"`, et la base `(default)` est créée en `europe-west1`.

- [ ] **Step 3 : Clé Gemini (utilisateur)**

1. Créer une clé API sur https://aistudio.google.com/apikey.
2. Tester la clé en local, sans rien déployer :

```bash
cd functions && npm run build
GEMINI_API_KEY=<CLE> node -e "import('./lib/theme.js').then(async (m) => console.log(await m.generateTheme(process.env.GEMINI_API_KEY, [])))"
```

Expected : un thème absurde en français s'affiche, pas `null`. Si `null` s'affiche, lire l'avertissement logué : clé invalide ou modèle `gemini-3.8-flash` indisponible. Dans ce dernier cas, remplacer `GEMINI_MODEL` par un modèle Flash listé sur https://ai.google.dev/gemini-api/docs/models, puis relancer `npm run build` et l'étape 3.

3. Stocker la clé comme secret :

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

- [ ] **Step 4 : Déployer (après confirmation de l'utilisateur)**

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Expected : `Deploy complete!` et la fonction `tick(europe-west1)` est créée. Si la CLI demande d'activer des API (Cloud Scheduler, Cloud Build, Artifact Registry, Secret Manager), accepter.

- [ ] **Step 5 : Vérifier en production**

Au quart d'heure suivant :

```bash
firebase functions:log --only tick
```

Expected : une ligne `tick done` avec `actions: [{ type: "create", date: "<aujourd'hui>" }]`. Dans la console Firestore, le document `days/<aujourd'hui>` existe avec `status: "pending"`, un `theme` et un `dropAt` entre 10:00 et 19:45, heure de Paris.

- [ ] **Step 6 : Commit**

```bash
git add .firebaserc
git commit -m "chore: link Firebase project"
```
