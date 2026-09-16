# Angelus client iOS — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Statut : implémenté le 2026-09-16**, directement sur `main` (commits `45d3c16`, `af50d72`, `f9c2c16`), puis corrigé après relecture (`a9b9074`). Le code de ce plan est celui d'avant relecture : **le repo fait foi**. Restent à faire : la tâche 5 (déploiement de la règle `presence`, fournisseur Apple dans Firebase, `eas init`, build et TestFlight), bloquée par le renouvellement de l'abonnement Apple Developer.

**Goal :** construire l'app iOS Angelus avec la DA Radio pirate, branchée sur le backend déjà en production (`angelus-sons`), puis la distribuer via TestFlight. Au programme :
- connexion Apple et pseudo ;
- groupes et QR code ;
- thème du jour, poster, voter en live ;
- playlist ;
- notifications ;
- suppression de compte.

**Architecture :**
- App Expo Router dont les écrans (`app/`) lisent et écrivent directement dans Firestore via le SDK JS Firebase, avec les règles comme garde-fou.
- Trois couches dans `src/` :
  - `lib/` : Firebase, Deezer, auth Apple, écritures, lecteur audio, notifs ;
  - `hooks/` : listeners Firestore et contextes session et groupes ;
  - `ui/` : composants de la DA.
- Les pochettes « photocopie tramée » sont rendues par un shader Skia.

**Tech Stack :**
- Expo SDK 57 (React Native 0.86, React 19.2), Expo Router 57 avec Native Tabs (`expo-router/unstable-native-tabs`), TypeScript 6.
- `firebase` 12.19, `@shopify/react-native-skia` 2.6.2, `react-native-svg` 15.15.4.
- `expo-audio`, `expo-camera`, `expo-apple-authentication`, `expo-notifications`, `react-native-qrcode-svg` 6.3.
- Polices : Big Shoulders Display et Courier Prime (`@expo-google-fonts`).

**Spec :** `docs/superpowers/specs/2026-09-14-angelus-design.md`, sections §2, §3, §5, §6 (dont `presence`), §8, §9 et §11 (DA Radio pirate). Maquette de référence : `docs/da/da-2-radio-pirate.html`.

## Global Constraints

- **iOS uniquement.** Bundle ID `app.angelus.ios`, scheme `angelus`. Lien d'invitation : `angelus://join/{gid}`.
- **Projet Firebase** `angelus-sons` (déjà en production). La config web Firebase est publique et figée dans `src/lib/firebase.ts`.
- **Doc Expo** : lire https://docs.expo.dev/versions/v57.0.0/ avant tout écart par rapport au code fourni (exigence d'`AGENTS.md`). Le code de ce plan a été compilé (`tsc`) et bundlé (`expo export`) contre les versions ci-dessous.
- **Installation des dépendances** : `npx expo install` pour les paquets Expo et natifs. Pinner `react-dom` via `npx expo install react-dom`, sinon `npm install` échoue sur un conflit de peer deps (react-dom 19.3 contre react 19.2.3).
- **Données Firestore** (spec §5) :
  - `users/{uid}` : `{ name, createdAt }` ;
  - `pushTokens/{uid}` : `{ token, updatedAt }` ;
  - `groups/{gid}` : `{ name, ownerId, memberIds }` ;
  - `groups/{gid}/playlist/{date}_{uid}` ;
  - `groups/{gid}/days/{date}/votes/{uid}` : `{ postUid, updatedAt }` ;
  - `days/{date}` : `{ theme, dropAt, status }` ;
  - `days/{date}/posts/{uid}` : `{ track, postedAt, late }` ;
  - `days/{date}/presence/{uid}` : `{ postedAt, late }`.
- **Temps** : `Europe/Paris`, clé de journée `YYYY-MM-DD`. « À l'heure » = drop + 1 h. Votes clos à minuit.
- **DA Radio pirate** (spec §11) :
  - couleurs : papier `#E9E9E5`, papier neuf `#F7F7F3`, toner `#000000`, surligneur `#F2FF3A`, marqueur `#E3261B`, trame `#8A8A86` ;
  - le surligneur couvre toujours une ligne entière ;
  - le marqueur ne porte jamais de texte, sauf le tampon et le badge « en retard » ;
  - l'unique animation est le tampon, désactivée si l'utilisateur réduit les animations.
- **Textes de l'interface** en français, en sentence case, tels qu'écrits dans le code.
- **Pas de tests automatisés** (décision utilisateur). La vérification passe par `npx tsc --noEmit`, `npx expo export --platform ios` et un lancement sur simulateur avec capture d'écran.
- **Sorties de commandes** : les commandes `grep` du shell peuvent être redirigées vers ripgrep. Utiliser `command grep` pour des motifs GNU.

---

### Task 1: Règle Firestore `presence`

**Files:**
- Modify: `firestore.rules` (ajouter un bloc dans `match /days/{date}`, juste avant `match /posts/{uid}`)

**Interfaces :**
- Consomme : les fonctions existantes de `firestore.rules` : `signedIn()`, `isMe(uid)`, `dayData(date)`.
- Produit : `days/{date}/presence/{uid}` lisible par tout user connecté. Créable uniquement dans le même batch qu'un post du même user, avec le même `late`. Utilisé par `postTrack` (tâche 2) et `usePresence` (tâche 2).

- [ ] **Step 1 : Ajouter le bloc**

Dans `firestore.rules`, à l'intérieur de `match /days/{date} { … }`, insérer avant la ligne `      match /posts/{uid} {` :

```
      match /presence/{uid} {
        allow read: if signedIn();
        allow create: if isMe(uid)
          && dayData(date).status == 'live'
          && request.resource.data.keys().hasOnly(['postedAt', 'late'])
          && request.resource.data.postedAt == request.time
          && existsAfter(/databases/$(database)/documents/days/$(date)/posts/$(uid))
          && getAfter(/databases/$(database)/documents/days/$(date)/posts/$(uid)).data.late == request.resource.data.late;
        allow update, delete: if false;
      }

```

- [ ] **Step 2 : Vérifier la compilation des règles**

Run : `firebase deploy --only firestore:rules --project angelus-sons --dry-run`
Expected : `✔  cloud.firestore: rules file firestore.rules compiled successfully` et aucune erreur. Le `--dry-run` ne publie rien. Le déploiement réel se fait à la tâche 5, avec l'utilisateur.

- [ ] **Step 3 : Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore): add presence collection rules"
```

---

### Task 2: Socle de l'app et logique

**Files:**
- Delete: `App.tsx`, `index.ts`
- Modify: `package.json` (`main` et dépendances), `app.json`, `tsconfig.json`
- Create: `eas.json`
- Create: `src/lib/firebase.ts`, `src/lib/types.ts`, `src/lib/dates.ts`, `src/lib/deezer.ts`, `src/lib/data.ts`, `src/lib/auth.ts`, `src/lib/player.tsx`, `src/lib/notifications.ts`
- Create: `src/hooks/useSession.tsx`, `src/hooks/useGroups.tsx`, `src/hooks/useMembers.ts`, `src/hooks/useNow.ts`, `src/hooks/useDay.ts`, `src/hooks/useDayFeed.ts`, `src/hooks/usePlaylist.ts`
- Create: `src/ui/theme.ts`

**Interfaces :**
- Consomme : la règle `presence` (tâche 1, déployée à la tâche 5).
- Produit (utilisé par les tâches 3 et 4) :
  - `@/lib/firebase` : `app`, `auth`, `db`.
  - `@/lib/types` : `Track`, `UserProfile`, `Group`, `Day`, `DayStatus`, `Post`, `Presence`, `Vote`, `PlaylistEntry`, `toDate`.
  - `@/lib/dates` : `parisDateKey(d)`, `nextParisMidnight(d)`, `parisTimeLabel(d)`, `shortDateLabel(key) → { day, month }`, `durationLabel(ms)`, `ON_TIME_WINDOW_MS`.
  - `@/lib/deezer` : `SearchResult`, `searchTracks(q, signal?)`, `fetchPreviewUrl(deezerId)`.
  - `@/lib/data` :
    - `MAX_GROUP_SIZE` ;
    - `createProfile(uid, name)`, `createGroup(uid, name) → gid`, `joinGroup(gid, uid)`, `removeFromGroup(gid, uid)` ;
    - `postTrack(date, uid, track, dropAt)` ;
    - `castVote(gid, date, uid, postUid)`, `removeVote(gid, date, uid)` ;
    - `savePushToken(uid, token)`, `deleteMyData(uid)`.
  - `@/lib/auth` : `signInWithApple() → givenName | null`, `isAppleCancel(e)`, `deleteAccount()`.
  - `@/lib/player` : `PlayerProvider`, `usePlayer() → { currentKey, playing, progress, didJustFinish, toggle(key, resolveUrl), stop() }`.
  - `@/lib/notifications` : `registerForPush(uid) → PushPermission`, `getPushPermission()`, `PushPermission`.
  - `@/hooks/useSession` : `SessionProvider`, `useSession() → { loading, user, profile, suggestedName, setSuggestedName }`.
  - `@/hooks/useGroups` : `GroupsProvider`, `useGroups() → { loading, groups, selected, select(gid) }`.
  - Autres hooks :
    - `useMembers(memberIds) → Record<uid, name>` ;
    - `useNow(ms?)` ;
    - `useDay(date) → { kind: "loading" | "waiting" } | { kind: "ready", day }` ;
    - `usePresence(date, memberIds)`, `usePosts(date, memberIds, enabled)`, `useVotes(gid, date)` ;
    - `usePlaylist(gid) → { loading, entries }`.
  - `@/ui/theme` : `colors`, `fonts`.

- [ ] **Step 1 : Dépendances**

Depuis la racine du repo :

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar expo-apple-authentication expo-crypto expo-audio expo-camera expo-notifications expo-device expo-font expo-dev-client @react-native-async-storage/async-storage react-native-svg @shopify/react-native-skia react-native-reanimated react-native-worklets firebase react-dom
npm install react-native-qrcode-svg@6.3.24 @expo-google-fonts/big-shoulders-display@0.2.3 @expo-google-fonts/courier-prime@0.4.1
```

Expected : `package.json` contient notamment `"@shopify/react-native-skia": "2.6.2"`, `"react-native-svg": "15.15.4"`, `"react-dom": "19.2.3"`, `"firebase": "^12.19.0"`, `"expo-router": "~57.0.21"`, `"react-native-qrcode-svg": "^6.3.24"`.

- [ ] **Step 2 : Point d'entrée et config**

```bash
git rm App.tsx index.ts
npm pkg set main=expo-router/entry
```

Remplacer `app.json` par :

```json
{
  "expo": {
    "name": "Angelus",
    "slug": "angelus",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "angelus",
    "userInterfaceStyle": "light",
    "ios": {
      "bundleIdentifier": "app.angelus.ios",
      "supportsTablet": false,
      "usesAppleSignIn": true,
      "infoPlist": {
        "CFBundleDevelopmentRegion": "fr",
        "CFBundleLocalizations": [
          "fr"
        ],
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "plugins": [
      "expo-router",
      "expo-apple-authentication",
      [
        "expo-camera",
        {
          "cameraPermission": "Angelus utilise la caméra pour scanner le QR code d'un groupe."
        }
      ],
      "expo-notifications",
      "expo-audio"
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

Remplacer `tsconfig.json` par le contenu ci-dessous. Le mapping `@firebase/auth` expose à TypeScript les types React Native, sans quoi `getReactNativePersistence` est introuvable. `functions` reste exclu.

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"],
      "@firebase/auth": ["./node_modules/@firebase/auth/dist/index.rn.d.ts"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
  "exclude": ["node_modules", "functions", "ios", "android"]
}
```

Créer `eas.json` :

```json
{
  "cli": {
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 3 : Thème et Firebase**

`src/ui/theme.ts` :

```ts
export const colors = {
  paper: "#E9E9E5",
  paperNew: "#F7F7F3",
  toner: "#000000",
  fluo: "#F2FF3A",
  marker: "#E3261B",
  screen: "#8A8A86",
  tape: "rgba(214, 205, 178, 0.75)",
};

export const fonts = {
  display: "BigShouldersDisplay_900Black",
  displayBold: "BigShouldersDisplay_800ExtraBold",
  type: "CourierPrime_400Regular",
  typeBold: "CourierPrime_700Bold",
};
```

`src/lib/firebase.ts` :

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

// Firebase web config is public by design; access is enforced by firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyDQGA1KVfQAFRXstBzz50F7NNnjIfSYd6Q",
  authDomain: "angelus-sons.firebaseapp.com",
  projectId: "angelus-sons",
  storageBucket: "angelus-sons.firebasestorage.app",
  messagingSenderId: "666346786242",
  appId: "1:666346786242:web:b317427d594f4ff6255a5b",
};

export const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
```

`src/lib/types.ts` :

```ts
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
```

`src/lib/dates.ts` :

```ts
const TIME_ZONE = "Europe/Paris";

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

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function parisParts(instant: Date) {
  const parts = Object.fromEntries(partsFormat.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Paris calendar date of an instant, as "YYYY-MM-DD" (same key as the backend). */
export function parisDateKey(instant: Date): string {
  const p = parisParts(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Instant of the next Paris midnight after `instant`. DST switches happen at 2-3 am, never at midnight. */
export function nextParisMidnight(instant: Date): Date {
  const p = parisParts(instant);
  const offsetMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day + 1) - offsetMs);
}

/** "14:59" in Paris time. */
export function parisTimeLabel(instant: Date): string {
  const p = parisParts(instant);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "13 sept." from a "YYYY-MM-DD" key. */
export function shortDateLabel(dateKey: string): { day: string; month: string } {
  const [, month, day] = dateKey.split("-").map(Number);
  return { day: String(day), month: MONTHS[month - 1] };
}

/** "44:48" for durations under an hour, else "7 h 55". */
export function durationLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours} h ${pad(minutes)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export const ON_TIME_WINDOW_MS = 60 * 60 * 1000;
```

- [ ] **Step 4 : Deezer, écritures, auth**

`src/lib/deezer.ts` :

```ts
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
```

`src/lib/data.ts` :

```ts
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
  const deadline = dropAt.getTime() + ON_TIME_WINDOW_MS;
  const late = Date.now() > deadline;
  try {
    await write(late);
  } catch (error) {
    if (Math.abs(Date.now() - deadline) > 2 * 60_000) throw error;
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
```

`src/lib/auth.ts` :

```ts
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  deleteUser,
  OAuthProvider,
  reauthenticateWithCredential,
  revokeAccessToken,
  signInWithCredential,
} from "firebase/auth";
import { auth } from "./firebase";
import { deleteMyData } from "./data";

async function appleCredential() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const apple = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    nonce: hashedNonce,
  });
  if (!apple.identityToken) throw new Error("Apple did not return an identity token");
  const credential = new OAuthProvider("apple.com").credential({ idToken: apple.identityToken, rawNonce });
  return { apple, credential };
}

/** Signs in with Apple. Returns the given name Apple shares on the very first sign-in, if any. */
export async function signInWithApple(): Promise<string | null> {
  const { apple, credential } = await appleCredential();
  await signInWithCredential(auth, credential);
  return apple.fullName?.givenName ?? null;
}

export function isAppleCancel(error: unknown): boolean {
  return (error as { code?: string })?.code === "ERR_REQUEST_CANCELED";
}

/** Re-authenticates with Apple, revokes the Apple token, deletes app data then the Firebase user. */
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const { apple, credential } = await appleCredential();
  await reauthenticateWithCredential(user, credential);
  if (apple.authorizationCode) {
    try {
      await revokeAccessToken(auth, apple.authorizationCode);
    } catch (error) {
      console.warn("Apple token revocation failed", error);
    }
  }
  await deleteMyData(user.uid);
  await deleteUser(user);
}
```

- [ ] **Step 5 : Lecteur audio et notifications**

`src/lib/player.tsx` :

```tsx
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "react-native";

interface PlayerState {
  /** Key of the track loaded in the player (e.g. a post uid or a Deezer id), or null. */
  currentKey: string | null;
  playing: boolean;
  progress: number;
  didJustFinish: boolean;
  toggle: (key: string, resolveUrl: () => Promise<string | null>) => Promise<void>;
  stop: () => void;
}

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [currentKey, setCurrentKey] = useState<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const toggle = useCallback(
    async (key: string, resolveUrl: () => Promise<string | null>) => {
      if (key === currentKey) {
        if (status.playing) {
          player.pause();
        } else {
          if (status.didJustFinish) player.seekTo(0);
          player.play();
        }
        return;
      }
      const url = await resolveUrl();
      if (!url) {
        Alert.alert("Extrait indisponible", "Deezer ne fournit pas d'extrait pour ce son.");
        return;
      }
      player.replace({ uri: url });
      player.play();
      setCurrentKey(key);
    },
    [currentKey, player, status.playing, status.didJustFinish],
  );

  const stop = useCallback(() => {
    player.pause();
    setCurrentKey(null);
  }, [player]);

  const value = useMemo<PlayerState>(
    () => ({
      currentKey,
      playing: status.playing,
      progress: status.duration > 0 ? status.currentTime / status.duration : 0,
      didJustFinish: status.didJustFinish,
      toggle,
      stop,
    }),
    [currentKey, status.playing, status.currentTime, status.duration, status.didJustFinish, toggle, stop],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerState {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider");
  return value;
}
```

`src/lib/notifications.ts` :

```ts
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { savePushToken } from "./data";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushPermission = "granted" | "denied" | "undetermined";

/** Asks for permission if needed and stores the Expo push token. Returns the final permission. */
export async function registerForPush(uid: string): Promise<PushPermission> {
  let { status } = await Notifications.getPermissionsAsync();
  if (status === "undetermined") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted" || !Device.isDevice) return status;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await savePushToken(uid, data);
  } catch (error) {
    console.warn("Push token registration failed", error);
  }
  return status;
}

export async function getPushPermission(): Promise<PushPermission> {
  return (await Notifications.getPermissionsAsync()).status;
}
```

- [ ] **Step 6 : Hooks**

`src/hooks/useSession.tsx` :

```tsx
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/types";

interface Session {
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
  /** Given name shared by Apple on first sign-in, used to prefill the pseudo. */
  suggestedName: string | null;
  setSuggestedName: (name: string | null) => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (next) => {
        setUser(next);
        setAuthReady(true);
      }),
    [],
  );

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setProfileReady(true);
      },
      () => setProfileReady(true),
    );
  }, [user]);

  const value: Session = {
    loading: !authReady || !profileReady,
    user,
    profile,
    suggestedName,
    setSuggestedName,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
```

`src/hooks/useGroups.tsx` :

```tsx
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { db } from "@/lib/firebase";
import type { Group } from "@/lib/types";
import { useSession } from "./useSession";

interface Groups {
  loading: boolean;
  groups: Group[];
  selected: Group | null;
  select: (gid: string) => void;
}

const GroupsContext = createContext<Groups | null>(null);

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, "groups"), where("memberIds", "array-contains", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const next = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Group, "id">) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setGroups(next);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);

  const selected = groups.find((g) => g.id === selectedId) ?? groups[0] ?? null;
  const value: Groups = { loading, groups, selected, select: setSelectedId };
  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups(): Groups {
  const value = useContext(GroupsContext);
  if (!value) throw new Error("useGroups must be used inside GroupsProvider");
  return value;
}
```

`src/hooks/useMembers.ts` :

```ts
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";

/** Map uid -> pseudo for the given members. */
export function useMembers(memberIds: string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = [...memberIds].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      memberIds.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        return [uid, (snap.get("name") as string | undefined) ?? "Quelqu'un"] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) setNames(Object.fromEntries(entries));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return names;
}
```

`src/hooks/useNow.ts` :

```ts
import { useEffect, useState } from "react";

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

`src/hooks/useDay.ts` :

```ts
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import type { Day, DayStatus } from "@/lib/types";

export type DayState = { kind: "loading" } | { kind: "waiting" } | { kind: "ready"; day: Day };

const RETRY_MS = 30_000;

/**
 * Today's day document. Rules hide it until the drop, so a denied read means "waiting":
 * we retry every 30 s until the theme is published.
 */
export function useDay(date: string): DayState {
  const [state, setState] = useState<DayState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState((prev) => (prev.kind === "ready" && prev.day.date === date ? prev : { kind: "loading" }));
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSnapshot(
      doc(db, "days", date),
      (snap) => {
        if (!snap.exists()) {
          setState({ kind: "waiting" });
          retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
          return;
        }
        const data = snap.data() as { theme: string; dropAt: Timestamp; status: DayStatus };
        setState({ kind: "ready", day: { date, theme: data.theme, dropAt: data.dropAt.toDate(), status: data.status } });
      },
      () => {
        setState({ kind: "waiting" });
        retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
      },
    );
    return () => {
      unsubscribe();
      if (retry) clearTimeout(retry);
    };
  }, [date, attempt]);

  return state;
}
```

`src/hooks/useDayFeed.ts` :

```ts
import { collection, documentId, onSnapshot, query, where, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { toDate, type Post, type Presence, type Track, type Vote } from "@/lib/types";

/** Who posted today among the group (readable by everyone signed in). */
export function usePresence(date: string, memberIds: string[]): Presence[] {
  const [presence, setPresence] = useState<Presence[]>([]);
  const key = [...memberIds].sort().join(",");

  useEffect(() => {
    if (memberIds.length === 0) {
      setPresence([]);
      return;
    }
    const q = query(collection(db, "days", date, "presence"), where(documentId(), "in", memberIds));
    return onSnapshot(
      q,
      (snap) =>
        setPresence(
          snap.docs.map((d) => {
            const data = d.data() as { postedAt: Timestamp | null; late: boolean };
            return { uid: d.id, postedAt: toDate(data.postedAt), late: data.late };
          }),
        ),
      () => setPresence([]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, key]);

  return presence;
}

/** Tracks posted today by the group. Only readable once I posted, so pass `enabled` accordingly. */
export function usePosts(date: string, memberIds: string[], enabled: boolean): Post[] {
  const [posts, setPosts] = useState<Post[]>([]);
  const key = [...memberIds].sort().join(",");

  useEffect(() => {
    if (!enabled || memberIds.length === 0) {
      setPosts([]);
      return;
    }
    const q = query(collection(db, "days", date, "posts"), where(documentId(), "in", memberIds));
    return onSnapshot(
      q,
      (snap) =>
        setPosts(
          snap.docs.map((d) => {
            const data = d.data() as { track: Track; postedAt: Timestamp | null; late: boolean };
            return { uid: d.id, track: data.track, postedAt: toDate(data.postedAt), late: data.late };
          }),
        ),
      () => setPosts([]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, key, enabled]);

  return posts;
}

export function useVotes(gid: string | null, date: string): Vote[] {
  const [votes, setVotes] = useState<Vote[]>([]);

  useEffect(() => {
    if (!gid) {
      setVotes([]);
      return;
    }
    return onSnapshot(
      collection(db, "groups", gid, "days", date, "votes"),
      (snap) => setVotes(snap.docs.map((d) => ({ voterUid: d.id, postUid: d.get("postUid") as string }))),
      () => setVotes([]),
    );
  }, [gid, date]);

  return votes;
}
```

`src/hooks/usePlaylist.ts` :

```ts
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import type { PlaylistEntry } from "@/lib/types";

export function usePlaylist(gid: string | null): { loading: boolean; entries: PlaylistEntry[] } {
  const [state, setState] = useState<{ loading: boolean; entries: PlaylistEntry[] }>({ loading: true, entries: [] });

  useEffect(() => {
    if (!gid) {
      setState({ loading: false, entries: [] });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    const q = query(collection(db, "groups", gid, "playlist"), orderBy("date", "desc"));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          loading: false,
          entries: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlaylistEntry, "id">) })),
        }),
      () => setState({ loading: false, entries: [] }),
    );
  }, [gid]);

  return state;
}
```

- [ ] **Step 7 : Vérifier**

Run : `npx tsc --noEmit`
Expected : aucune erreur. Le dossier `app/` n'existe pas encore, c'est normal : l'app ne se lance pas avant la tâche 4.

- [ ] **Step 8 : Commit**

```bash
git add package.json package-lock.json app.json tsconfig.json eas.json src
git commit -m "feat(app): set up Expo Router project with Firebase, Deezer and audio logic"
```

---

### Task 3: Composants de la DA Radio pirate

**Files:**
- Create: `src/ui/Text.tsx`, `src/ui/Paper.tsx`, `src/ui/Tape.tsx`, `src/ui/TapedStrip.tsx`, `src/ui/Highlight.tsx`, `src/ui/Tally.tsx`, `src/ui/HalftoneCover.tsx`, `src/ui/LockedTile.tsx`, `src/ui/Stamp.tsx`, `src/ui/Button.tsx`, `src/ui/Avatar.tsx`, `src/ui/Badge.tsx`, `src/ui/PlayButton.tsx`, `src/ui/GroupSwitcher.tsx`, `src/ui/NoGroup.tsx`

**Interfaces :**
- Consomme : `colors`, `fonts` (tâche 2) ; `useGroups`, `useSession`, `createGroup` (tâche 2).
- Produit (utilisé par la tâche 4) :
  - textes et fond : `Display`, `Type` (`size`, `color`, `bold`) ; `Paper({ children, style, edges })` ;
  - papier : `Tape({ style, width, rotate })` ; `TapedStrip({ children, rotate, style })` ; `Highlight({ children, style })` ;
  - votes et pochettes : `Tally({ count, color })` ; `HalftoneCover({ uri, size })` ; `LockedTile({ size })` ; `Stamp({ label, animate })` ;
  - contrôles : `Button({ label, onPress, variant: "primary" | "secondary" | "danger", disabled, loading, style })` ; `Avatar({ name, size })` ; `LateBadge({ late })` ; `PlayButton({ playing, onPress, size })` ;
  - groupes : `GroupSwitcher({ title? })` ; `NoGroup()` ; `promptCreateGroup(uid, onCreated)`.

- [ ] **Step 1 : Textes, papier, scotch, surligneur**

`src/ui/Text.tsx` :

```tsx
import { Text, type TextProps } from "react-native";
import { colors, fonts } from "./theme";

type Props = TextProps & { size?: number; color?: string };

/** Big Shoulders Display: themes, track titles, big numbers, buttons. */
export function Display({ size = 28, color = colors.toner, style, ...rest }: Props) {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.02, color, letterSpacing: -0.3 }, style]}
    />
  );
}

/** Courier Prime: everything else, like typed on a typewriter. */
export function Type({ size = 15, color = colors.toner, bold = false, style, ...rest }: Props & { bold?: boolean }) {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: bold ? fonts.typeBold : fonts.type, fontSize: size, lineHeight: size * 1.35, color }, style]}
    />
  );
}
```

`src/ui/Paper.tsx` :

```tsx
import { Canvas, ColorMatrix, FractalNoise, Rect } from "@shopify/react-native-skia";
import { useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";

// Keeps only the darkest noise specks, as sparse toner grain (same matrix as the mockup's SVG filter).
const GRAIN = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, -4.35];

/** Screen background: photocopy paper with light toner grain, safe-area aware. */
export function Paper({ children, style, edges = ["top"] }: { children: ReactNode; style?: ViewStyle; edges?: ("top" | "bottom")[] }) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.root,
        { paddingTop: edges.includes("top") ? insets.top : 0, paddingBottom: edges.includes("bottom") ? insets.bottom : 0 },
        style,
      ]}
    >
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Rect x={0} y={0} width={size.width} height={size.height} opacity={0.5}>
          <FractalNoise freqX={1.05} freqY={1.05} octaves={2} seed={4} />
          <ColorMatrix matrix={GRAIN} />
        </Rect>
      </Canvas>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
});
```

`src/ui/Tape.tsx` :

```tsx
import { View, type ViewStyle } from "react-native";
import { colors } from "./theme";

/** A strip of translucent tape. Position it absolutely over the element it holds. */
export function Tape({ style, width = 56, rotate = -8 }: { style?: ViewStyle; width?: number; rotate?: number }) {
  return (
    <View
      pointerEvents="none"
      style={[
        { position: "absolute", width, height: 20, backgroundColor: colors.tape, transform: [{ rotate: `${rotate}deg` }] },
        style,
      ]}
    />
  );
}
```

`src/ui/TapedStrip.tsx` :

```tsx
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { Tape } from "./Tape";
import { colors } from "./theme";

/** Cut-out strip of fresh paper taped slightly askew (theme, sticker, own post card). */
export function TapedStrip({ children, rotate = -1.5, style }: { children: ReactNode; rotate?: number; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.paperNew,
          paddingHorizontal: 16,
          paddingVertical: 14,
          transform: [{ rotate: `${rotate}deg` }],
          shadowColor: colors.toner,
          shadowOpacity: 0.12,
          shadowRadius: 2,
          shadowOffset: { width: 1, height: 2 },
        },
        style,
      ]}
    >
      <Tape style={{ top: -10, left: -14 }} rotate={-18} />
      <Tape style={{ bottom: -8, right: -12 }} rotate={-12} />
      {children}
    </View>
  );
}
```

`src/ui/Highlight.tsx` :

```tsx
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { colors } from "./theme";

/** Fluo highlighter swipe behind a whole line (never a single word). */
export function Highlight({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ alignSelf: "flex-start" }, style]}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: -4,
          right: -6,
          top: "4%",
          bottom: "4%",
          backgroundColor: colors.fluo,
          transform: [{ skewX: "-6deg" }, { rotate: "-0.6deg" }],
        }}
      />
      {children}
    </View>
  );
}
```

- [ ] **Step 2 : Bâtons, pochettes tramées, tuile cachée, tampon**

`src/ui/Tally.tsx` :

```tsx
import Svg, { Path } from "react-native-svg";
import { colors } from "./theme";

const STROKE = 3;
const HEIGHT = 22;
const GAP = 6;

/** Deterministic small wobble so marks look hand drawn but stay stable across renders. */
function jitter(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2.4;
}

/** Red marker tally marks: groups of four strokes crossed by a fifth. */
export function Tally({ count, color = colors.marker }: { count: number; color?: string }) {
  if (count <= 0) return null;
  const groups = Math.ceil(count / 5);
  const width = groups * (4 * GAP + 14) - 8;
  const paths: string[] = [];

  for (let g = 0; g < groups; g++) {
    const inGroup = Math.min(5, count - g * 5);
    const x0 = g * (4 * GAP + 14) + 2;
    for (let s = 0; s < Math.min(4, inGroup); s++) {
      const x = x0 + s * GAP;
      paths.push(`M${x + jitter(g * 5 + s, 1)} ${2 + jitter(s, 2)} L${x + jitter(g * 5 + s, 3)} ${HEIGHT - 2}`);
    }
    if (inGroup === 5) {
      paths.push(`M${x0 - 4} ${HEIGHT - 5 + jitter(g, 4)} L${x0 + 3 * GAP + 4} ${5 + jitter(g, 5)}`);
    }
  }

  return (
    <Svg width={width} height={HEIGHT}>
      {paths.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}
```

`src/ui/HalftoneCover.tsx` :

```tsx
import { Canvas, Fill, ImageShader, Shader, Skia, useImage } from "@shopify/react-native-skia";
import { View } from "react-native";
import { colors } from "./theme";

// Black & white halftone: one dot per cell, dot radius driven by the cell's luminance.
const HALFTONE = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float cell;
uniform vec3 paper;

half4 main(vec2 xy) {
  vec2 center = (floor(xy / cell) + 0.5) * cell;
  half4 c = image.eval(center);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  lum = clamp((lum - 0.5) * 1.5 + 0.5, 0.0, 1.0);
  float radius = (1.0 - lum) * cell * 0.75;
  float ink = 1.0 - smoothstep(radius - 0.7, radius + 0.7, distance(xy, center));
  return half4(mix(paper, vec3(0.0), ink), 1.0);
}
`)!;

const PAPER = [0xf7 / 255, 0xf7 / 255, 0xf3 / 255];

/** Album cover printed like a photocopy. */
export function HalftoneCover({ uri, size }: { uri: string; size: number }) {
  const image = useImage(uri);
  const rect = { x: 0, y: 0, width: size, height: size };

  return (
    <View style={{ width: size, height: size, borderWidth: 1, borderColor: colors.toner, backgroundColor: colors.paperNew }}>
      <Canvas style={{ width: size - 2, height: size - 2 }}>
        {image && (
          <Fill>
            <Shader source={HALFTONE} uniforms={{ cell: Math.max(2.5, size / 28), paper: PAPER }}>
              <ImageShader image={image} fit="cover" rect={rect} />
            </Shader>
          </Fill>
        )}
      </Canvas>
    </View>
  );
}
```

`src/ui/LockedTile.tsx` :

```tsx
import Svg, { Path } from "react-native-svg";
import { View } from "react-native";
import { Type } from "./Text";
import { Tape } from "./Tape";
import { colors } from "./theme";

/** A friend's track you can't see yet: failed photocopy with a toner smear and a "caché" tape. */
export function LockedTile({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path
          d="M6 62 C 20 48, 38 70, 55 56 S 86 50, 95 60 L 94 72 C 80 66, 64 80, 46 72 S 16 76, 5 74 Z"
          fill={colors.toner}
        />
        <Path d="M10 30 L 40 26 M 58 34 L 88 30" stroke={colors.screen} strokeWidth={3} strokeDasharray="1 4" />
      </Svg>
      <Tape style={{ top: -6, left: size / 2 - 30 }} width={60} rotate={-4} />
      <Type size={12} bold style={{ position: "absolute", top: -4, width: size, textAlign: "center" }}>
        caché
      </Type>
    </View>
  );
}
```

`src/ui/Stamp.tsx` :

```tsx
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";
import { Display } from "./Text";
import { colors } from "./theme";

/** Red rubber stamp "Posté 14:59". Slams once when `animate` is true, unless reduced motion is on. */
export function Stamp({ label, animate }: { label: string; animate: boolean }) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!animate) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.spring(progress, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [animate, reduceMotion, progress]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] });
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ rotate: "-9deg" }, { scale }],
        borderWidth: 3,
        borderColor: colors.marker,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Display size={20} color={colors.marker}>
        {label}
      </Display>
    </Animated.View>
  );
}
```

- [ ] **Step 3 : Contrôles**

`src/ui/Button.tsx` :

```tsx
import { ActivityIndicator, Pressable, type ViewStyle } from "react-native";
import { Display } from "./Text";
import { colors } from "./theme";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = "primary", disabled, loading, style }: Props) {
  const primary = variant === "primary";
  const tint = variant === "danger" ? colors.marker : colors.toner;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: 52,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 18,
          backgroundColor: primary ? colors.toner : "transparent",
          borderWidth: 2,
          borderColor: tint,
          opacity: disabled ? 0.35 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.paperNew : tint} />
      ) : (
        <Display size={24} color={primary ? colors.paperNew : tint}>
          {label}
        </Display>
      )}
    </Pressable>
  );
}
```

`src/ui/Avatar.tsx` :

```tsx
import { View } from "react-native";
import { Display } from "./Text";
import { colors } from "./theme";

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: colors.toner,
        backgroundColor: colors.paperNew,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Display size={size * 0.5}>{name.slice(0, 1).toUpperCase()}</Display>
    </View>
  );
}
```

`src/ui/Badge.tsx` :

```tsx
import { View } from "react-native";
import { Type } from "./Text";
import { colors } from "./theme";

export function LateBadge({ late }: { late: boolean }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderWidth: 1.5,
        borderColor: late ? colors.marker : colors.toner,
        backgroundColor: late ? colors.marker : "transparent",
        paddingHorizontal: 6,
      }}
    >
      <Type size={12} bold color={late ? colors.paperNew : colors.toner}>
        {late ? "en retard" : "à l'heure"}
      </Type>
    </View>
  );
}
```

`src/ui/PlayButton.tsx` :

```tsx
import { Pressable } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "./theme";

export function PlayButton({ playing, onPress, size = 44 }: { playing: boolean; onPress: () => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? "Mettre en pause" : "Écouter l'extrait"}
      onPress={onPress}
      hitSlop={8}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: colors.toner,
        backgroundColor: playing ? colors.toner : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={size * 0.4} height={size * 0.4} viewBox="0 0 10 10">
        {playing ? (
          <>
            <Rect x={1.5} y={1} width={2.5} height={8} fill={colors.paperNew} />
            <Rect x={6} y={1} width={2.5} height={8} fill={colors.paperNew} />
          </>
        ) : (
          <Path d="M2.5 1 L9 5 L2.5 9 Z" fill={colors.toner} />
        )}
      </Svg>
    </Pressable>
  );
}
```

`src/ui/GroupSwitcher.tsx` :

```tsx
import { ActionSheetIOS, Pressable, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { Display, Type } from "./Text";

/** Group name as a title; tapping it lets you switch between your groups. */
export function GroupSwitcher({ title }: { title?: (groupName: string) => string }) {
  const { groups, selected, select } = useGroups();
  if (!selected) return null;

  const open = () => {
    if (groups.length < 2) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...groups.map((g) => g.name), "Annuler"], cancelButtonIndex: groups.length, title: "Changer de groupe" },
      (index) => {
        if (index < groups.length) select(groups[index].id);
      },
    );
  };

  const position = groups.findIndex((g) => g.id === selected.id) + 1;
  return (
    <Pressable onPress={open} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
      <Display size={34} style={{ flexShrink: 1 }}>
        {title ? title(selected.name) : selected.name}
        {groups.length > 1 ? " ⌄" : ""}
      </Display>
      {groups.length > 1 && (
        <View style={{ paddingBottom: 6 }}>
          <Type size={12}>
            {position} de tes {groups.length} groupes
          </Type>
        </View>
      )}
    </Pressable>
  );
}
```

`src/ui/NoGroup.tsx` :

```tsx
import { router } from "expo-router";
import { Alert, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { useSession } from "@/hooks/useSession";
import { createGroup } from "@/lib/data";
import { Button } from "./Button";
import { Paper } from "./Paper";
import { TapedStrip } from "./TapedStrip";
import { Display, Type } from "./Text";

export function promptCreateGroup(uid: string, onCreated: (gid: string) => void) {
  Alert.prompt("Créer un groupe", "Donne-lui un nom, tes amis le verront.", async (name) => {
    if (!name?.trim()) return;
    try {
      onCreated(await createGroup(uid, name.slice(0, 30)));
    } catch {
      Alert.alert("Création impossible", "Vérifie ta connexion et réessaie.");
    }
  });
}

/** Empty state shown by every tab while the user has no group. */
export function NoGroup() {
  const { user } = useSession();
  const { select } = useGroups();
  return (
    <Paper style={{ paddingHorizontal: 20, justifyContent: "center", gap: 28 }}>
      <TapedStrip>
        <Display size={36}>Tu n'as pas encore de groupe</Display>
      </TapedStrip>
      <Type>Crée le tien et fais scanner son QR code à tes amis, ou scanne le code d'un groupe existant.</Type>
      <View style={{ gap: 12 }}>
        <Button label="Créer un groupe" onPress={() => user && promptCreateGroup(user.uid, select)} />
        <Button label="Scanner un code" variant="secondary" onPress={() => router.push("/scan")} />
      </View>
    </Paper>
  );
}
```

- [ ] **Step 4 : Vérifier**

Run : `npx tsc --noEmit`
Expected : aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/ui
git commit -m "feat(app): add Radio pirate UI components"
```

---

### Task 4: Écrans

**Files:**
- Create: `app/_layout.tsx`, `app/sign-in.tsx`, `app/onboarding.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/playlist.tsx`, `app/(tabs)/group.tsx`, `app/search.tsx`, `app/scan.tsx`, `app/join/[gid].tsx`

**Interfaces :**
- Consomme : tout `src/` (tâches 2 et 3).
- Produit :
  - routes : `/sign-in`, `/onboarding`, onglets `/` (Aujourd'hui), `/playlist`, `/group` ;
  - modales : `/search`, `/scan`, `/join/[gid]` ;
  - deep link `angelus://join/{gid}`.
- **Garde d'auth** (`Stack.Protected`) :
  - pas connecté : `sign-in` ;
  - connecté sans profil : `onboarding` ;
  - connecté avec profil : onglets et modales.

- [ ] **Step 1 : Layouts, connexion, onboarding**

`app/_layout.tsx` :

```tsx
import { BigShouldersDisplay_800ExtraBold, BigShouldersDisplay_900Black } from "@expo-google-fonts/big-shoulders-display";
import { CourierPrime_400Regular, CourierPrime_700Bold } from "@expo-google-fonts/courier-prime";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GroupsProvider } from "@/hooks/useGroups";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { registerForPush } from "@/lib/notifications";
import { PlayerProvider } from "@/lib/player";
import { colors } from "@/ui/theme";

function RootNavigator() {
  const { loading, user, profile } = useSession();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (user && profile) registerForPush(user.uid).catch(() => {});
  }, [user, profile]);

  useEffect(() => {
    if (lastResponse && user && profile) router.navigate("/");
  }, [lastResponse, user, profile]);

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !profile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !!profile}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" options={{ presentation: "modal" }} />
        <Stack.Screen name="scan" options={{ presentation: "modal" }} />
        <Stack.Screen name="join/[gid]" options={{ presentation: "modal" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BigShouldersDisplay_800ExtraBold,
    BigShouldersDisplay_900Black,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
  });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;

  return (
    <SessionProvider>
      <GroupsProvider>
        <PlayerProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </PlayerProvider>
      </GroupsProvider>
    </SessionProvider>
  );
}
```

`app/sign-in.tsx` :

```tsx
import * as AppleAuthentication from "expo-apple-authentication";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useSession } from "@/hooks/useSession";
import { isAppleCancel, signInWithApple } from "@/lib/auth";
import { Highlight } from "@/ui/Highlight";
import { Paper } from "@/ui/Paper";
import { TapedStrip } from "@/ui/TapedStrip";
import { Display, Type } from "@/ui/Text";

export default function SignInScreen() {
  const { setSuggestedName } = useSession();
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setSuggestedName(await signInWithApple());
    } catch (error) {
      if (!isAppleCancel(error)) Alert.alert("Connexion impossible", "La connexion avec Apple a échoué. Réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper edges={["top", "bottom"]} style={{ paddingHorizontal: 24, justifyContent: "space-between" }}>
      <View style={{ marginTop: 72, gap: 28 }}>
        <Display size={96} style={{ lineHeight: 88 }}>
          Angelus
        </Display>
        <TapedStrip rotate={-2}>
          <Display size={30}>Un thème absurde par jour. Un son. Tes potes votent.</Display>
        </TapedStrip>
        <Highlight>
          <Type size={16}>Le thème tombe à une heure surprise. Tu as 1 h pour poster.</Type>
        </Highlight>
      </View>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={0}
        style={{ height: 56, marginBottom: 24 }}
        onPress={onSignIn}
      />
    </Paper>
  );
}
```

`app/onboarding.tsx` :

```tsx
import { useState } from "react";
import { Alert, KeyboardAvoidingView, TextInput, View } from "react-native";
import { useSession } from "@/hooks/useSession";
import { createProfile } from "@/lib/data";
import { Button } from "@/ui/Button";
import { Paper } from "@/ui/Paper";
import { Display, Type } from "@/ui/Text";
import { colors, fonts } from "@/ui/theme";

export default function OnboardingScreen() {
  const { user, suggestedName } = useSession();
  const [name, setName] = useState(suggestedName ?? "");
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 0 && name.trim().length <= 30;

  const onContinue = async () => {
    if (!user || !valid) return;
    setSaving(true);
    try {
      await createProfile(user.uid, name);
    } catch {
      Alert.alert("Enregistrement impossible", "Vérifie ta connexion et réessaie.");
      setSaving(false);
    }
  };

  return (
    <Paper edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, paddingHorizontal: 24, justifyContent: "space-between" }}>
        <View style={{ marginTop: 64, gap: 16 }}>
          <Display size={48}>Comment on t'appelle ?</Display>
          <Type>Ton pseudo apparaît à côté de tes sons et de tes votes.</Type>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ton pseudo"
            placeholderTextColor={colors.screen}
            maxLength={30}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onContinue}
            style={{
              borderWidth: 2,
              borderColor: colors.toner,
              backgroundColor: colors.paperNew,
              paddingHorizontal: 14,
              height: 56,
              fontFamily: fonts.typeBold,
              fontSize: 20,
              color: colors.toner,
            }}
          />
        </View>
        <Button label="Continuer" onPress={onContinue} disabled={!valid} loading={saving} style={{ marginBottom: 16 }} />
      </KeyboardAvoidingView>
    </Paper>
  );
}
```

`app/(tabs)/_layout.tsx` :

```tsx
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { colors } from "@/ui/theme";

export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.toner}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="antenna.radiowaves.left.and.right" />
        <NativeTabs.Trigger.Label>Aujourd'hui</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="playlist">
        <NativeTabs.Trigger.Icon sf={{ default: "recordingtape", selected: "recordingtape" }} />
        <NativeTabs.Trigger.Label>Playlist</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="group">
        <NativeTabs.Trigger.Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <NativeTabs.Trigger.Label>Groupe</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

- [ ] **Step 2 : Aujourd'hui**

`app/(tabs)/index.tsx` :

```tsx
import { router } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useDay } from "@/hooks/useDay";
import { usePosts, usePresence, useVotes } from "@/hooks/useDayFeed";
import { useGroups } from "@/hooks/useGroups";
import { useMembers } from "@/hooks/useMembers";
import { useNow } from "@/hooks/useNow";
import { useSession } from "@/hooks/useSession";
import { castVote, removeVote } from "@/lib/data";
import { durationLabel, nextParisMidnight, ON_TIME_WINDOW_MS, parisDateKey, parisTimeLabel } from "@/lib/dates";
import { fetchPreviewUrl } from "@/lib/deezer";
import { usePlayer } from "@/lib/player";
import type { Day, Group, Post, Vote } from "@/lib/types";
import { LateBadge } from "@/ui/Badge";
import { GroupSwitcher } from "@/ui/GroupSwitcher";
import { HalftoneCover } from "@/ui/HalftoneCover";
import { Highlight } from "@/ui/Highlight";
import { LockedTile } from "@/ui/LockedTile";
import { NoGroup } from "@/ui/NoGroup";
import { Paper } from "@/ui/Paper";
import { PlayButton } from "@/ui/PlayButton";
import { Stamp } from "@/ui/Stamp";
import { Tally } from "@/ui/Tally";
import { TapedStrip } from "@/ui/TapedStrip";
import { Display, Type } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { colors } from "@/ui/theme";

export default function TodayScreen() {
  const { selected, loading } = useGroups();
  const now = useNow();
  const date = parisDateKey(now);
  const dayState = useDay(date);

  if (loading) return <Paper>{null}</Paper>;
  if (!selected) return <NoGroup />;

  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }}>
        <GroupSwitcher />
        {dayState.kind === "loading" && <Type>Chargement du thème…</Type>}
        {dayState.kind === "waiting" && <Waiting />}
        {dayState.kind === "ready" && <DayFeed day={dayState.day} group={selected} now={now} />}
      </ScrollView>
    </Paper>
  );
}

function Waiting() {
  return (
    <View style={{ gap: 16, marginTop: 24 }}>
      <TapedStrip>
        <Display size={34}>Pas encore de thème aujourd'hui</Display>
      </TapedStrip>
      <Type>Il tombe à une heure surprise, entre 10 h et 20 h. Tu recevras une notif.</Type>
    </View>
  );
}

function DayFeed({ day, group, now }: { day: Day; group: Group; now: Date }) {
  const { user } = useSession();
  const uid = user!.uid;
  const presence = usePresence(day.date, group.memberIds);
  const iPosted = presence.some((p) => p.uid === uid);
  const posts = usePosts(day.date, group.memberIds, iPosted);
  const votes = useVotes(group.id, day.date);
  const names = useMembers(group.memberIds);

  const deadline = day.dropAt.getTime() + ON_TIME_WINDOW_MS;
  const closed = day.status === "closed";

  return (
    <View style={{ gap: 20 }}>
      <TapedStrip>
        <Display size={36}>{day.theme}</Display>
      </TapedStrip>

      {iPosted ? (
        <PostedFeed day={day} group={group} uid={uid} posts={posts} votes={votes} names={names} now={now} closed={closed} />
      ) : (
        <View style={{ gap: 16 }}>
          {closed ? (
            <Type bold>La journée est terminée.</Type>
          ) : now.getTime() < deadline ? (
            <View>
              <Highlight>
                <Display size={64}>{durationLabel(deadline - now.getTime())}</Display>
              </Highlight>
              <Type>pour poster à l'heure. Après, ton son sera marqué en retard.</Type>
            </View>
          ) : (
            <Highlight>
              <Type bold>Tu es en retard, tu peux encore poster jusqu'à minuit.</Type>
            </Highlight>
          )}

          <Display size={26}>Déjà postés</Display>
          {presence.length === 0 ? (
            <Type>Personne n'a encore posté. Lance-toi.</Type>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
              {presence.map((p) => (
                <View key={p.uid} style={{ gap: 6 }}>
                  <LockedTile size={92} />
                  <Display size={20}>{names[p.uid] ?? "…"}</Display>
                </View>
              ))}
            </View>
          )}
          <Missing memberIds={group.memberIds.filter((m) => !presence.some((p) => p.uid === m))} names={names} />
          <Type bold>Poste ton son pour écouter les leurs.</Type>
          {!closed && <Button label="Choisir mon son" onPress={() => router.push("/search")} />}
        </View>
      )}
    </View>
  );
}

function Missing({ memberIds, names }: { memberIds: string[]; names: Record<string, string> }) {
  if (memberIds.length === 0) return null;
  const list = memberIds.map((m) => names[m] ?? "…");
  const text = list.length === 1 ? `${list[0]} n'a pas encore posté.` : `${list.slice(0, -1).join(", ")} et ${list.at(-1)} n'ont pas encore posté.`;
  return <Type>{text}</Type>;
}

type FeedProps = {
  day: Day;
  group: Group;
  uid: string;
  posts: Post[];
  votes: Vote[];
  names: Record<string, string>;
  now: Date;
  closed: boolean;
};

function PostedFeed({ day, group, uid, posts, votes, names, now, closed }: FeedProps) {
  const player = usePlayer();
  const mine = posts.find((p) => p.uid === uid);
  const others = posts.filter((p) => p.uid !== uid).sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());
  const postedUids = new Set(posts.map((p) => p.uid));
  const myVote = votes.find((v) => v.voterUid === uid)?.postUid ?? null;

  // Same counting rule as the backend: members who posted, no self vote.
  const votersByPost = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const v of votes) {
      if (v.voterUid === v.postUid || !postedUids.has(v.voterUid) || !postedUids.has(v.postUid)) continue;
      (map[v.postUid] ??= []).push(v.voterUid);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votes, posts]);

  // Stamp slams only when my post appears during this session, not when reopening the app.
  const hadMine = useRef<boolean | null>(null);
  const animateStamp = hadMine.current === false && !!mine;
  useEffect(() => {
    if (hadMine.current === null || mine) hadMine.current = !!mine;
  }, [mine]);

  const play = (post: Post) => player.toggle(`post:${post.uid}`, () => fetchPreviewUrl(post.track.deezerId));

  const onVote = async (postUid: string) => {
    if (closed) return;
    try {
      if (myVote === postUid) await removeVote(group.id, day.date, uid);
      else await castVote(group.id, day.date, uid, postUid);
    } catch {
      Alert.alert("Vote impossible", "Vérifie ta connexion et réessaie.");
    }
  };

  const voterNames = (postUid: string) => (votersByPost[postUid] ?? []).map((v) => (v === uid ? "Toi" : names[v] ?? "…"));

  return (
    <View style={{ gap: 18 }}>
      <Highlight>
        <Display size={30}>{closed ? "Vote clos" : `Vote clos dans ${durationLabel(nextParisMidnight(now).getTime() - now.getTime())}`}</Display>
      </Highlight>

      {mine && (
        <View style={{ borderWidth: 2, borderColor: colors.toner, backgroundColor: colors.paperNew, padding: 12, flexDirection: "row", gap: 12 }}>
          <Pressable onPress={() => play(mine)} accessibilityLabel="Écouter ton son">
            <HalftoneCover uri={mine.track.cover} size={84} />
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Type size={13}>Ton son</Type>
              <LateBadge late={mine.late} />
            </View>
            <Display size={26} numberOfLines={2}>
              {mine.track.title}
            </Display>
            <Type size={13}>{mine.track.artist}</Type>
            <VoteLine names={voterNames(uid)} />
          </View>
          <View style={{ position: "absolute", right: 8, bottom: 6 }}>
            <Stamp label={`Posté ${parisTimeLabel(mine.postedAt)}`} animate={animateStamp} />
          </View>
        </View>
      )}

      <Type size={13}>Un vote, modifiable jusqu'à minuit.</Type>

      {others.map((post) => {
        const voted = myVote === post.uid;
        const count = votersByPost[post.uid]?.length ?? 0;
        const playing = player.currentKey === `post:${post.uid}` && player.playing;
        return (
          <View key={post.uid} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <View>
              <HalftoneCover uri={post.track.cover} size={64} />
              <View style={{ position: "absolute", left: 4, bottom: 4 }}>
                <PlayButton size={28} playing={playing} onPress={() => play(post)} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Type size={13} bold>
                  {names[post.uid] ?? "…"}
                </Type>
                {post.late && <LateBadge late />}
              </View>
              <Display size={22} numberOfLines={1}>
                {post.track.title}
              </Display>
              <Type size={13} numberOfLines={1}>
                {post.track.artist}
              </Type>
              <VoteLine names={voterNames(post.uid)} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: voted, disabled: closed }}
              onPress={() => onVote(post.uid)}
              disabled={closed}
              style={{
                minWidth: 76,
                minHeight: 52,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: voted ? 3 : 2,
                borderColor: voted ? colors.marker : colors.toner,
                borderRadius: voted ? 30 : 0,
                paddingHorizontal: 8,
                opacity: closed ? 0.4 : 1,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Tally count={Math.min(count, 5)} />
                <Display size={22}>{count}</Display>
              </View>
              <Type size={12} bold>
                {voted ? "Ton vote" : "Voter"}
              </Type>
            </Pressable>
          </View>
        );
      })}

      <Missing memberIds={group.memberIds.filter((m) => !postedUids.has(m))} names={names} />
    </View>
  );
}

function VoteLine({ names }: { names: string[] }) {
  if (names.length === 0) return <Type size={12}>Aucun vote</Type>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Tally count={names.length} />
      <Type size={12} bold numberOfLines={1} style={{ flexShrink: 1 }}>
        {names.join(", ")}
      </Type>
    </View>
  );
}
```

- [ ] **Step 3 : Recherche, playlist, groupe**

`app/search.tsx` :

```tsx
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from "react-native";
import { useDay } from "@/hooks/useDay";
import { useGroups } from "@/hooks/useGroups";
import { useSession } from "@/hooks/useSession";
import { postTrack } from "@/lib/data";
import { parisDateKey } from "@/lib/dates";
import { searchTracks, type SearchResult } from "@/lib/deezer";
import { usePlayer } from "@/lib/player";
import { Button } from "@/ui/Button";
import { HalftoneCover } from "@/ui/HalftoneCover";
import { Highlight } from "@/ui/Highlight";
import { Paper } from "@/ui/Paper";
import { PlayButton } from "@/ui/PlayButton";
import { Display, Type } from "@/ui/Text";
import { colors, fonts } from "@/ui/theme";

type SearchState = { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "done"; results: SearchResult[] };

export default function SearchScreen() {
  const { user } = useSession();
  const { groups } = useGroups();
  const player = usePlayer();
  const date = parisDateKey(new Date());
  const dayState = useDay(date);
  const [queryText, setQueryText] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const q = queryText.trim();
    if (q.length < 2) {
      setState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        setState({ kind: "done", results: await searchTracks(q, controller.signal) });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [queryText, attempt]);

  useEffect(() => () => player.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPost = () => {
    if (!user || !selected || dayState.kind !== "ready") return;
    Alert.alert(`Poster ${selected.title} ?`, "Tu ne pourras plus le changer aujourd'hui.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Poster",
        onPress: async () => {
          setPosting(true);
          try {
            const { preview: _preview, ...track } = selected;
            await postTrack(date, user.uid, track, dayState.day.dropAt);
            router.back();
          } catch {
            setPosting(false);
            Alert.alert("Envoi impossible", "La journée est peut-être terminée, ou la connexion a coupé. Réessaie.");
          }
        },
      },
    ]);
  };

  const groupCount = groups.length;
  return (
    <Paper edges={["bottom"]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
              <Type>Annuler</Type>
            </Pressable>
            <Display size={30}>Ton son du jour</Display>
          </View>
          {dayState.kind === "ready" && <Type size={13}>Thème : {dayState.day.theme}</Type>}
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: colors.toner, backgroundColor: colors.paperNew, paddingHorizontal: 12 }}>
            <TextInput
              value={queryText}
              onChangeText={setQueryText}
              placeholder="Titre ou artiste"
              placeholderTextColor={colors.screen}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, height: 48, fontFamily: fonts.typeBold, fontSize: 18, color: colors.toner }}
            />
            {state.kind === "loading" && <ActivityIndicator color={colors.toner} />}
          </View>
          <Type size={12}>Résultats Deezer</Type>
        </View>

        {state.kind === "error" ? (
          <View style={{ padding: 20, gap: 12 }}>
            <Type bold>Recherche indisponible, réessaie.</Type>
            <Button label="Réessayer" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
          </View>
        ) : (
          <FlatList
            data={state.kind === "done" ? state.results : []}
            keyExtractor={(item) => String(item.deezerId)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
            ListEmptyComponent={state.kind === "done" ? <Type style={{ marginTop: 16 }}>Aucun résultat. Essaie un autre titre.</Type> : null}
            renderItem={({ item }) => {
              const isSelected = selected?.deezerId === item.deezerId;
              const key = `search:${item.deezerId}`;
              const playing = player.currentKey === key && player.playing;
              return (
                <Pressable
                  onPress={() => setSelected(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.screen, gap: 8 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <HalftoneCover uri={item.cover} size={52} />
                    <View style={{ flex: 1 }}>
                      {isSelected ? (
                        <Highlight>
                          <Display size={22} numberOfLines={1}>
                            {item.title}
                          </Display>
                        </Highlight>
                      ) : (
                        <Display size={22} numberOfLines={1}>
                          {item.title}
                        </Display>
                      )}
                      <Type size={13} numberOfLines={1}>
                        {item.artist}
                      </Type>
                    </View>
                    <PlayButton
                      playing={playing}
                      onPress={() => {
                        setSelected(item);
                        player.toggle(key, async () => item.preview);
                      }}
                    />
                  </View>
                  {player.currentKey === key && (
                    <View style={{ height: 3, backgroundColor: colors.screen, marginLeft: 64 }}>
                      <View style={{ height: 3, width: `${Math.round(player.progress * 100)}%`, backgroundColor: colors.toner }} />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}

        <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 10, borderTopWidth: 2, borderColor: colors.toner }}>
          <Type size={13}>
            Définitif une fois posté. Ton son part dans {groupCount > 1 ? `tes ${groupCount} groupes` : "ton groupe"}.
          </Type>
          <Button label="Poster ce son" onPress={onPost} disabled={!selected || dayState.kind !== "ready"} loading={posting} />
        </View>
      </KeyboardAvoidingView>
    </Paper>
  );
}
```

`app/(tabs)/playlist.tsx` :

```tsx
import { useEffect, useRef } from "react";
import { FlatList, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { usePlaylist } from "@/hooks/usePlaylist";
import { shortDateLabel } from "@/lib/dates";
import { fetchPreviewUrl } from "@/lib/deezer";
import { usePlayer } from "@/lib/player";
import type { PlaylistEntry } from "@/lib/types";
import { Button } from "@/ui/Button";
import { GroupSwitcher } from "@/ui/GroupSwitcher";
import { HalftoneCover } from "@/ui/HalftoneCover";
import { NoGroup } from "@/ui/NoGroup";
import { Paper } from "@/ui/Paper";
import { PlayButton } from "@/ui/PlayButton";
import { Tally } from "@/ui/Tally";
import { Display, Type } from "@/ui/Text";
import { colors } from "@/ui/theme";

export default function PlaylistScreen() {
  const { selected, loading } = useGroups();
  const { entries } = usePlaylist(selected?.id ?? null);
  const player = usePlayer();
  const queue = useRef<number | null>(null);

  const playAt = (index: number) => {
    const entry = entries[index];
    if (!entry) {
      queue.current = null;
      return;
    }
    player.toggle(`playlist:${entry.id}`, () => fetchPreviewUrl(entry.track.deezerId));
  };

  // "Tout écouter": when a preview ends, move on to the next winner.
  useEffect(() => {
    if (queue.current === null || !player.didJustFinish) return;
    const next = queue.current + 1;
    queue.current = next < entries.length ? next : null;
    if (queue.current !== null) playAt(queue.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.didJustFinish]);

  if (loading) return <Paper>{null}</Paper>;
  if (!selected) return <NoGroup />;

  return (
    <Paper>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 0 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 16 }}>
            <GroupSwitcher title={(name) => `Playlist de ${name}`} />
            <Type>Le son gagnant de chaque jour.</Type>
            {entries.length > 0 && (
              <Button
                label="Tout écouter"
                onPress={() => {
                  queue.current = 0;
                  playAt(0);
                }}
                style={{ alignSelf: "flex-start" }}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          <Type style={{ marginTop: 12 }}>Pas encore de gagnant. Le premier sera annoncé le lendemain du premier vote, à 9 h.</Type>
        }
        renderItem={({ item }) => (
          <PlaylistRow
            entry={item}
            playing={player.currentKey === `playlist:${item.id}` && player.playing}
            onPlay={() => {
              queue.current = null;
              player.toggle(`playlist:${item.id}`, () => fetchPreviewUrl(item.track.deezerId));
            }}
          />
        )}
        style={{ borderLeftWidth: 0 }}
      />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, backgroundColor: colors.toner }} />
    </Paper>
  );
}

function PlaylistRow({ entry, playing, onPlay }: { entry: PlaylistEntry; playing: boolean; onPlay: () => void }) {
  const { day, month } = shortDateLabel(entry.date);
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.screen }}>
      <View style={{ width: 44, alignItems: "center" }}>
        <Display size={30}>{day}</Display>
        <Type size={12}>{month}</Type>
      </View>
      <HalftoneCover uri={entry.track.cover} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Type size={12} style={{ fontStyle: "italic" }} numberOfLines={2}>
          {entry.theme}
        </Type>
        <Display size={22} numberOfLines={1}>
          {entry.track.title}
        </Display>
        <Type size={12} numberOfLines={1}>
          {entry.track.artist}
        </Type>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Tally count={entry.votes} />
          <Type size={12} bold>
            {entry.winnerName}, {entry.votes} vote{entry.votes > 1 ? "s" : ""}
          </Type>
        </View>
      </View>
      <PlayButton playing={playing} onPress={onPlay} />
    </View>
  );
}
```

`app/(tabs)/group.tsx` :

```tsx
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useGroups } from "@/hooks/useGroups";
import { useMembers } from "@/hooks/useMembers";
import { useSession } from "@/hooks/useSession";
import { deleteAccount, isAppleCancel } from "@/lib/auth";
import { MAX_GROUP_SIZE, removeFromGroup } from "@/lib/data";
import { getPushPermission, registerForPush, type PushPermission } from "@/lib/notifications";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { GroupSwitcher } from "@/ui/GroupSwitcher";
import { Highlight } from "@/ui/Highlight";
import { NoGroup, promptCreateGroup } from "@/ui/NoGroup";
import { Paper } from "@/ui/Paper";
import { Tape } from "@/ui/Tape";
import { Display, Type } from "@/ui/Text";
import { colors } from "@/ui/theme";

export default function GroupScreen() {
  const { user } = useSession();
  const { selected, loading, select } = useGroups();
  const names = useMembers(selected?.memberIds ?? []);
  const permission = usePushPermission();
  const [deleting, setDeleting] = useState(false);

  if (loading) return <Paper>{null}</Paper>;
  if (!selected || !user) return <NoGroup />;

  const isOwner = selected.ownerId === user.uid;

  const confirmRemove = (uid: string) =>
    Alert.alert(`Retirer ${names[uid] ?? "ce membre"} ?`, "Il pourra revenir en rescannant le QR code.", [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: () => removeFromGroup(selected.id, uid).catch(() => {}) },
    ]);

  const confirmLeave = () =>
    Alert.alert(`Quitter ${selected.name} ?`, "Tes sons passés restent dans sa playlist.", [
      { text: "Annuler", style: "cancel" },
      { text: "Quitter", style: "destructive", onPress: () => removeFromGroup(selected.id, user.uid).catch(() => {}) },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      "Supprimer ton compte ?",
      "Tu quittes tes groupes, ceux que tu as créés sont supprimés, et ton pseudo disparaît. Apple te demandera de confirmer.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
            } catch (error) {
              if (!isAppleCancel(error)) Alert.alert("Suppression impossible", "Réessaie dans un instant.");
              setDeleting(false);
            }
          },
        },
      ],
    );

  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 24 }}>
        <GroupSwitcher />

        {permission === "denied" && (
          <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Highlight>
              <Type bold>Notifs désactivées : tu rateras le thème. Touche ici pour les réactiver.</Type>
            </Highlight>
          </Pressable>
        )}

        <View style={{ alignItems: "center", gap: 12 }}>
          <View style={{ backgroundColor: colors.paperNew, padding: 18, transform: [{ rotate: "2deg" }], borderWidth: 1, borderColor: colors.toner }}>
            <Tape style={{ top: -10, left: -12 }} rotate={-30} />
            <Tape style={{ bottom: -8, right: -14 }} rotate={-20} />
            <QRCode value={`angelus://join/${selected.id}`} size={200} color={colors.toner} backgroundColor={colors.paperNew} />
          </View>
          <Type style={{ textAlign: "center" }}>Fais scanner ce code par tes amis. Il les ajoute directement au groupe.</Type>
        </View>

        <View style={{ gap: 12 }}>
          <Display size={26}>
            Membres {selected.memberIds.length} / {MAX_GROUP_SIZE}
          </Display>
          {selected.memberIds.map((uid) => (
            <View key={uid} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={names[uid] ?? "?"} />
              <View style={{ flex: 1 }}>
                <Display size={22}>{uid === user.uid ? `${names[uid] ?? "Toi"} (toi)` : names[uid] ?? "…"}</Display>
                {uid === selected.ownerId && <Type size={12}>créateur</Type>}
              </View>
              {isOwner && uid !== user.uid && (
                <Pressable onPress={() => confirmRemove(uid)} hitSlop={10} accessibilityRole="button">
                  <Type bold color={colors.marker}>
                    Retirer
                  </Type>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        <View style={{ gap: 12 }}>
          <Button label="Scanner un code" variant="secondary" onPress={() => router.push("/scan")} />
          <Button label="Créer un groupe" variant="secondary" onPress={() => promptCreateGroup(user.uid, select)} />
          {!isOwner && <Button label="Quitter le groupe" variant="danger" onPress={confirmLeave} />}
        </View>

        <Button label="Supprimer mon compte" variant="danger" onPress={confirmDelete} loading={deleting} />
      </ScrollView>
    </Paper>
  );
}

function usePushPermission(): PushPermission | null {
  const { user } = useSession();
  const [permission, setPermission] = useState<PushPermission | null>(null);

  const refresh = useCallback(() => {
    getPushPermission().then(setPermission).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      refresh();
      if (user) registerForPush(user.uid).catch(() => {});
    });
    return () => sub.remove();
  }, [refresh, user]);

  return permission;
}
```

- [ ] **Step 4 : Scan et invitation**

`app/scan.tsx` :

```tsx
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/ui/Button";
import { Highlight } from "@/ui/Highlight";
import { Paper } from "@/ui/Paper";
import { Display, Type } from "@/ui/Text";
import { colors } from "@/ui/theme";

const JOIN_LINK = /^angelus:\/\/join\/([A-Za-z0-9_-]+)$/;

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    const match = JOIN_LINK.exec(data.trim());
    if (!match) {
      setError("Ce QR code n'est pas un groupe Angelus.");
      return;
    }
    handled.current = true;
    router.replace(`/join/${match[1]}`);
  };

  return (
    <Paper edges={["bottom"]} style={{ padding: 20, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Type>Fermer</Type>
        </Pressable>
        <Display size={30}>Scanner un groupe</Display>
      </View>

      {!permission ? null : !permission.granted ? (
        <View style={{ gap: 12 }}>
          <Type>Angelus a besoin de la caméra pour lire le QR code d'un groupe.</Type>
          {permission.canAskAgain ? (
            <Button label="Autoriser la caméra" onPress={requestPermission} />
          ) : (
            <Button label="Ouvrir les réglages" onPress={() => Linking.openSettings()} />
          )}
        </View>
      ) : (
        <>
          <View style={{ flex: 1, borderWidth: 3, borderColor: colors.toner, overflow: "hidden" }}>
            <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onScanned} />
          </View>
          {error ? (
            <Highlight>
              <Type bold>{error}</Type>
            </Highlight>
          ) : (
            <Type>Vise le QR code affiché dans l'onglet Groupe de ton ami.</Type>
          )}
        </>
      )}
    </Paper>
  );
}
```

`app/join/[gid].tsx` :

```tsx
import { doc, getDoc } from "firebase/firestore";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { useSession } from "@/hooks/useSession";
import { joinGroup, MAX_GROUP_SIZE } from "@/lib/data";
import { db } from "@/lib/firebase";
import type { Group } from "@/lib/types";
import { Button } from "@/ui/Button";
import { Paper } from "@/ui/Paper";
import { TapedStrip } from "@/ui/TapedStrip";
import { Display, Type } from "@/ui/Text";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "found"; group: Group };

export default function JoinScreen() {
  const { gid } = useLocalSearchParams<{ gid: string }>();
  const { user } = useSession();
  const { select } = useGroups();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "groups", gid))
      .then((snap) =>
        setState(snap.exists() ? { kind: "found", group: { id: snap.id, ...(snap.data() as Omit<Group, "id">) } } : { kind: "missing" }),
      )
      .catch(() => setState({ kind: "missing" }));
  }, [gid]);

  const open = () => {
    select(gid);
    router.dismissTo("/");
  };

  const onJoin = async () => {
    if (!user) return;
    setJoining(true);
    try {
      await joinGroup(gid, user.uid);
      open();
    } catch {
      setJoining(false);
      Alert.alert("Impossible de rejoindre", "Le groupe est peut-être complet. Réessaie plus tard.");
    }
  };

  return (
    <Paper edges={["bottom"]} style={{ padding: 20, justifyContent: "center", gap: 24 }}>
      {state.kind === "loading" && <Type>Recherche du groupe…</Type>}
      {state.kind === "missing" && (
        <>
          <Display size={36}>Ce groupe n'existe pas</Display>
          <Type>Le code est peut-être abîmé, ou le groupe a été supprimé.</Type>
          <Button label="Fermer" variant="secondary" onPress={() => router.back()} />
        </>
      )}
      {state.kind === "found" && user && (
        <>
          <TapedStrip>
            <Display size={40}>Rejoindre {state.group.name}</Display>
          </TapedStrip>
          <Type>
            {state.group.memberIds.length} / {MAX_GROUP_SIZE} membres
          </Type>
          <View style={{ gap: 12 }}>
            {state.group.memberIds.includes(user.uid) ? (
              <>
                <Type bold>Tu fais déjà partie de ce groupe.</Type>
                <Button label="Ouvrir le groupe" onPress={open} />
              </>
            ) : state.group.memberIds.length >= MAX_GROUP_SIZE ? (
              <Type bold>Ce groupe est complet.</Type>
            ) : (
              <Button label="Rejoindre" onPress={onJoin} loading={joining} />
            )}
            <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
          </View>
        </>
      )}
    </Paper>
  );
}
```

- [ ] **Step 5 : Vérifier la compilation et le bundle**

```bash
npx tsc --noEmit
CI=1 npx expo export --platform ios --output-dir /tmp/angelus-export
```

Expected : `tsc` sans erreur, et `expo export` affiche `Exported: /tmp/angelus-export` avec un bundle `ios` en `.hbc`.

- [ ] **Step 6 : Lancer sur simulateur et vérifier l'écran de connexion**

Build Release (bundle JS embarqué, pas besoin de Metro). Le `-derivedDataPath` local évite « unable to attach DB … database is locked », qui survient quand un autre build Xcode (par exemple un `expo run:ios` resté en arrière-plan) tient le DerivedData par défaut.

```bash
npx expo prebuild --platform ios --no-install && (cd ios && pod install)
UDID=$(xcrun simctl list devices available | command grep -m1 "iPhone 16 Pro (" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
xcodebuild -workspace ios/Angelus.xcworkspace -scheme Angelus -configuration Release -sdk iphonesimulator \
  -destination "id=$UDID" -derivedDataPath /tmp/angelus-dd CODE_SIGNING_ALLOWED=NO build 2>&1 | command grep -E "error:|\*\* BUILD" | tail -20
xcrun simctl boot "$UDID" 2>/dev/null; xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" /tmp/angelus-dd/Build/Products/Release-iphonesimulator/Angelus.app
xcrun simctl launch "$UDID" app.angelus.ios
sleep 8 && xcrun simctl io "$UDID" screenshot /tmp/angelus-sign-in.png
```

Expected : `** BUILD SUCCEEDED **` (10 à 15 min au premier build). En lisant la capture `/tmp/angelus-sign-in.png` :
- fond papier gris-blanc ;
- « Angelus » en très grande Big Shoulders noire ;
- une bande de papier scotchée de travers avec « Un thème absurde par jour. Un son. Tes potes votent. » ;
- 2 lignes Courier surlignées en jaune ;
- en bas, le bouton noir Apple.

Aucun écran rouge d'erreur. Le libellé du bouton suit la langue du simulateur : « Continue with Apple » sur un simulateur en anglais, « Continuer avec Apple » sur un iPhone en français (l'app déclare `fr`). Le dossier `ios/` généré est ignoré par git (`/ios`) et ne doit pas être commité.

- [ ] **Step 7 : Vérifier le deep link d'invitation**

L'app étant lancée sur le simulateur :

```bash
xcrun simctl openurl "$UDID" "angelus://join/test" && sleep 4 && xcrun simctl io "$UDID" screenshot /tmp/angelus-deeplink.png
```

Expected : la capture montre la boîte iOS « Open in "Angelus"? » par-dessus l'écran de connexion. Comme on n'est pas connecté, l'app reste ensuite sur l'écran de connexion, sans crash. Les écrans connectés se vérifient sur appareil à la tâche 5.

- [ ] **Step 8 : Commit**

```bash
git add app
git commit -m "feat(app): add screens for today, search, playlist, group and invites"
```

---

### Task 5: Mise en service et TestFlight

Tâche **avec l'utilisateur** : console Firebase, compte Expo, identifiants Apple, publication. Demander confirmation avant chaque commande qui publie (`firebase deploy`, `eas build`, `eas submit`).

**Files:**
- Modify: `app.json` (ajout de `extra.eas.projectId` et `owner` par `eas init`)

**Interfaces :**
- Consomme : tout ce qui précède.
- Produit : règle `presence` en production, projet EAS, build TestFlight installable.

- [ ] **Step 1 : Déployer la règle `presence`**

```bash
firebase deploy --only firestore:rules --project angelus-sons
```

Expected : `✔  firestore: released rules firestore.rules to cloud.firestore`.

- [ ] **Step 2 : Activer Sign in with Apple (utilisateur, console Firebase)**

Sur https://console.firebase.google.com/project/angelus-sons/authentication/providers :
1. Ajouter le fournisseur **Apple** et l'activer.
2. Laisser vides Services ID, Team ID et clé : ils ne servent pas pour l'iOS natif.
3. Enregistrer.

- [ ] **Step 3 : Lier le projet EAS**

```bash
eas init
```

Accepter la création du projet `@<compte>/angelus`.
Expected : `app.json` contient `"extra": { "eas": { "projectId": "<uuid>" } }` et `"owner"`.

```bash
git add app.json
git commit -m "chore(app): link EAS project"
```

- [ ] **Step 4 : Build de production et envoi sur TestFlight (utilisateur)**

```bash
eas build --platform ios --profile production
```

EAS demande de se connecter au compte Apple Developer. Accepter qu'EAS gère les certificats, le profil de provisioning, la clé de push (APNs) et la capacité Sign in with Apple pour `app.angelus.ios`.
Expected : `Build finished` avec un lien vers le `.ipa`.

```bash
eas submit --platform ios --latest
```

EAS crée l'app dans App Store Connect si besoin.
Expected : `Submitted your app to Apple App Store Connect`. L'app apparaît dans TestFlight après le traitement par Apple (5 à 30 min).

- [ ] **Step 5 : Vérifier sur iPhone (utilisateur)**

Installer via TestFlight, puis vérifier dans l'ordre :
1. Connexion avec Apple, puis pseudo, puis écran « Tu n'as pas encore de groupe ».
2. Créer un groupe. L'onglet Groupe affiche le QR code.
3. Autoriser les notifications. Dans la console Firestore, `pushTokens/{uid}` existe.
4. Si le thème du jour est tombé : « Choisir mon son », chercher, écouter l'extrait, poster. Le tampon « Posté HH:MM » claque, et `days/{date}/posts/{uid}` et `presence/{uid}` existent.
5. Avec un 2e compte (un ami, sur son téléphone) : scanner le QR code, rejoindre, poster, voter. Les bâtons se mettent à jour en live des deux côtés.
6. Le lendemain à 9 h : notif de résultats, et le gagnant est dans l'onglet Playlist.

