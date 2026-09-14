# Angelus backend — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** construire et déployer le backend d'Angelus : règles Firestore et fonction planifiée `tick`, qui crée le thème du jour, fait le drop, envoie le rappel, clôt les votes et annonce les résultats.

**Architecture :**
- Aucune fonction serveur appelable par l'app : elle écrit directement dans Firestore, et les règles de sécurité font la police.
- Une seule Cloud Function planifiée, `tick`, tourne toutes les 15 min en heure de Paris. Elle lit l'état de la journée et une fonction pure (`decideActions`) décide quoi faire. Les effets (Firestore, Gemini, push Expo) sont injectés, donc testables sur l'émulateur.

**Tech Stack :**
- Firebase : Firestore, Cloud Functions 2e génération (`firebase-functions` 7.3.2, `firebase-admin` 14.4.0), runtime Node 22.
- TypeScript 6, en modules ESM.
- Vitest 5 et `@firebase/rules-unit-testing` 5.
- `@google/genai` 2.22 (Gemini) et `expo-server-sdk` 7.2 (push).

**Spec :** `docs/superpowers/specs/2026-09-14-angelus-design.md`. Sections implémentées : §2 (règles du jeu), §5 (données), §6 (règles de sécurité), §7 (`tick`), §10 (tests). Le client Expo fera l'objet d'un plan séparé.

## Global Constraints

- Tout le backend vit dans `functions/` (package npm séparé) plus `firebase.json`, `firestore.rules` et `firestore.indexes.json` à la racine. Ne pas toucher au code de l'app Expo, sauf l'exclusion de `functions` dans le `tsconfig.json` racine (tâche 1).
- **Modules** : `"type": "module"`, TypeScript `module`/`moduleResolution` = `NodeNext`. Les imports relatifs finissent en `.js` (`import { x } from "./dates.js"`), y compris depuis les tests.
- **Versions exactes** :
  - dépendances : `firebase-functions@7.3.2`, `firebase-admin@14.4.0`, `@google/genai@2.22.0`, `expo-server-sdk@7.2.0` ;
  - dev : `typescript@~6.0.3`, `vitest@5.0.0`, `@firebase/rules-unit-testing@5.0.2`, `firebase@12.19.0`.
- **Node et Java** : Node 22 (runtime `nodejs22`). L'émulateur Firestore exige **Java 21+**. Sur cette machine, lancer avant toute commande émulateur : `export JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`. CLI Firebase globale `firebase` ≥ 15.
- **Temps** : fuseau unique `Europe/Paris`. Clé de journée : `YYYY-MM-DD` en heure de Paris. Créneaux de drop de 10:00 à 19:45, par pas de 15 min. Rappel à drop + 45 min, résultats à 09:00, « à l'heure » = drop + 1 h.
- **Projet** : les tests utilisent le projet fictif `demo-angelus`, sans projet Firebase réel. Le projet réel n'intervient qu'à la tâche 9.
- **Textes des notifications** en français, exactement comme dans `functions/src/messages.ts`.
- **Tests** :
  - unitaires : `npm test` depuis `functions/` ;
  - émulateur : `npm run test:emulator` depuis `functions/`, avec Java 21 exporté.

---

### Task 1: Squelette Firebase et helpers de date

**Files:**
- Create: `firebase.json`
- Create: `firestore.indexes.json`
- Modify: `tsconfig.json` (racine : exclure `functions`)
- Modify: `.gitignore` (racine : artefacts Firebase)
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/.gitignore`
- Create: `functions/src/dates.ts`
- Test: `functions/test/unit/dates.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit (`functions/src/dates.ts`) :
  - `parisDateKey(instant: Date): string` : date de Paris `"YYYY-MM-DD"` ;
  - `previousDateKey(dateKey: string): string` ;
  - `parisTimeToDate(dateKey: string, minutesOfDay: number): Date` : instant où l'horloge de Paris affiche `minutesOfDay` ce jour-là ;
  - `addMinutes(instant: Date, minutes: number): Date`.

- [ ] **Step 1 : Créer la config Firebase racine**

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

- [ ] **Step 3 : Créer le package `functions`**

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
    "build": "tsc",
    "test": "vitest run test/unit",
    "test:emulator": "firebase emulators:exec --only firestore --project demo-angelus --config ../firebase.json \"vitest run test/emulator --no-file-parallelism --test-timeout=30000\""
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

Installer les dépendances (depuis `functions/`) :

```bash
cd functions
npm install firebase-functions@7.3.2 firebase-admin@14.4.0 @google/genai@2.22.0 expo-server-sdk@7.2.0
npm install -D typescript@~6.0.3 vitest@5.0.0 @firebase/rules-unit-testing@5.0.2 firebase@12.19.0
```

Attendu : `package.json` contient les 4 `dependencies` et les 4 `devDependencies`, et `package-lock.json` est créé.

- [ ] **Step 4 : Écrire le test qui échoue**

`functions/test/unit/dates.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { addMinutes, parisDateKey, parisTimeToDate, previousDateKey } from "../../src/dates.js";

describe("parisDateKey", () => {
  it("uses the Paris calendar day", () => {
    expect(parisDateKey(new Date("2026-09-14T21:59:00Z"))).toBe("2026-09-14");
    expect(parisDateKey(new Date("2026-09-14T22:00:00Z"))).toBe("2026-09-15");
  });
});

describe("previousDateKey", () => {
  it("crosses month and year boundaries", () => {
    expect(previousDateKey("2026-03-01")).toBe("2026-02-28");
    expect(previousDateKey("2027-01-01")).toBe("2026-12-31");
  });
});

describe("parisTimeToDate", () => {
  it("handles summer time (UTC+2)", () => {
    expect(parisTimeToDate("2026-09-14", 14 * 60 + 37).toISOString()).toBe("2026-09-14T12:37:00.000Z");
  });
  it("handles winter time (UTC+1)", () => {
    expect(parisTimeToDate("2026-01-10", 10 * 60).toISOString()).toBe("2026-01-10T09:00:00.000Z");
  });
  it("handles DST switch days", () => {
    expect(parisTimeToDate("2026-03-29", 0).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(parisTimeToDate("2026-03-29", 10 * 60).toISOString()).toBe("2026-03-29T08:00:00.000Z");
    expect(parisTimeToDate("2026-10-25", 10 * 60).toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });
});

describe("addMinutes", () => {
  it("adds minutes", () => {
    expect(addMinutes(new Date("2026-09-14T12:00:00Z"), 45).toISOString()).toBe("2026-09-14T12:45:00.000Z");
  });
});
```

- [ ] **Step 5 : Vérifier qu'il échoue**

Run : `cd functions && npx vitest run test/unit/dates.test.ts`
Expected : FAIL, l'import `../../src/dates.js` est introuvable.

- [ ] **Step 6 : Implémenter**

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

- [ ] **Step 7 : Vérifier que ça passe**

Run : `cd functions && npx vitest run test/unit/dates.test.ts`
Expected : PASS, 6 tests.

- [ ] **Step 8 : Commit**

```bash
git add firebase.json firestore.indexes.json tsconfig.json .gitignore functions/package.json functions/package-lock.json functions/tsconfig.json functions/.gitignore functions/src/dates.ts functions/test/unit/dates.test.ts
git commit -m "feat(functions): scaffold Firebase backend with Paris date helpers"
```

---

### Task 2: Règles de sécurité Firestore

**Files:**
- Create: `firestore.rules`
- Test: `functions/test/emulator/rules.test.ts`

**Interfaces :**
- Consomme : `firebase.json` (tâche 1, qui déclare `firestore.rules` et le port émulateur 8080) et le script `test:emulator`.
- Produit : les règles de la spec §6, dont dépendent l'app et `tick`. Chemins et champs :
  - `users/{uid}` : `{ name, createdAt }` ;
  - `pushTokens/{uid}` : `{ token, updatedAt }` ;
  - `groups/{gid}` : `{ name, ownerId, memberIds }` ;
  - `groups/{gid}/playlist/{id}` ;
  - `groups/{gid}/days/{date}/votes/{uid}` : `{ postUid, updatedAt }` ;
  - `days/{date}` : `{ theme, dropAt, status, remindedAt?, resultsSentAt? }` ;
  - `days/{date}/posts/{uid}` : `{ track: { deezerId, title, artist, cover }, postedAt, late }`.

- [ ] **Step 1 : Écrire les tests qui échouent**

`functions/test/emulator/rules.test.ts` :

```ts
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const DATE = "2026-09-14";
const TRACK = { deezerId: 3135553, title: "The Lovecats", artist: "The Cure", cover: "https://cdn/x.jpg" };

let env: RulesTestEnvironment;

const db = (uid: string) => env.authenticatedContext(uid).firestore();

async function seed(dayOverrides: Record<string, unknown> = {}, posts: string[] = []) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, "days", DATE), {
      theme: "Le son que ton chat écoute en cachette",
      dropAt: Timestamp.fromMillis(Date.now() - 10 * 60_000),
      status: "live",
      ...dayOverrides,
    });
    await setDoc(doc(admin, "groups", "g1"), { name: "La Coloc", ownerId: "alice", memberIds: ["alice", "bob", "carol"] });
    for (const uid of posts) {
      await setDoc(doc(admin, "days", DATE, "posts", uid), { track: TRACK, postedAt: Timestamp.now(), late: false });
    }
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-angelus",
    firestore: { rules: readFileSync("../firestore.rules", "utf8") },
  });
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => env.cleanup());

describe("days", () => {
  it("hides a pending day", async () => {
    await seed({ status: "pending" });
    await assertFails(getDoc(doc(db("alice"), "days", DATE)));
  });
  it("shows a live day", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(db("alice"), "days", DATE)));
  });
});

describe("posts", () => {
  it("creates an on-time post", async () => {
    await seed();
    await assertSucceeds(setDoc(doc(db("alice"), "days", DATE, "posts", "alice"), { track: TRACK, postedAt: serverTimestamp(), late: false }));
  });
  it("rejects a wrong late flag", async () => {
    await seed();
    await assertFails(setDoc(doc(db("alice"), "days", DATE, "posts", "alice"), { track: TRACK, postedAt: serverTimestamp(), late: true }));
  });
  it("requires late=true after one hour", async () => {
    await seed({ dropAt: Timestamp.fromMillis(Date.now() - 2 * 3600_000) });
    await assertFails(setDoc(doc(db("alice"), "days", DATE, "posts", "alice"), { track: TRACK, postedAt: serverTimestamp(), late: false }));
    await assertSucceeds(setDoc(doc(db("alice"), "days", DATE, "posts", "alice"), { track: TRACK, postedAt: serverTimestamp(), late: true }));
  });
  it("rejects posting for someone else or on a pending day", async () => {
    await seed();
    await assertFails(setDoc(doc(db("alice"), "days", DATE, "posts", "bob"), { track: TRACK, postedAt: serverTimestamp(), late: false }));
    await seed({ status: "pending" });
    await assertFails(setDoc(doc(db("alice"), "days", DATE, "posts", "alice"), { track: TRACK, postedAt: serverTimestamp(), late: false }));
  });
  it("forbids updating a post", async () => {
    await seed({}, ["alice"]);
    await assertFails(updateDoc(doc(db("alice"), "days", DATE, "posts", "alice"), { late: true }));
  });
  it("lets only posters read posts, including list queries", async () => {
    await seed({}, ["alice", "bob"]);
    await assertFails(getDoc(doc(db("carol"), "days", DATE, "posts", "bob")));
    await assertSucceeds(getDoc(doc(db("alice"), "days", DATE, "posts", "bob")));
    await assertSucceeds(getDocs(query(collection(db("alice"), "days", DATE, "posts"), where("__name__", "in", ["alice", "bob"]))));
    await assertFails(getDocs(collection(db("carol"), "days", DATE, "posts")));
  });
});

describe("votes", () => {
  const vote = (uid: string, postUid: string) =>
    setDoc(doc(db(uid), "groups", "g1", "days", DATE, "votes", uid), { postUid, updatedAt: serverTimestamp() });

  it("accepts a valid vote and a change of mind", async () => {
    await seed({}, ["alice", "bob", "carol"]);
    await assertSucceeds(vote("alice", "bob"));
    await assertSucceeds(vote("alice", "carol"));
    await assertSucceeds(deleteDoc(doc(db("alice"), "groups", "g1", "days", DATE, "votes", "alice")));
  });
  it("rejects self vote, vote without post, vote for missing post", async () => {
    await seed({}, ["alice", "bob"]);
    await assertFails(vote("alice", "alice"));
    await assertFails(vote("carol", "bob"));
    await assertFails(vote("alice", "carol"));
  });
  it("rejects votes from non-members or on a closed day", async () => {
    await seed({}, ["alice", "bob", "dave"]);
    await assertFails(vote("dave", "bob"));
    await seed({ status: "closed" }, ["alice", "bob"]);
    await assertFails(vote("alice", "bob"));
  });
  it("lets members read votes", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(db("bob"), "groups", "g1", "days", DATE, "votes")));
    await assertFails(getDocs(collection(db("dave"), "groups", "g1", "days", DATE, "votes")));
  });
});

describe("groups", () => {
  it("creates a group owned by me", async () => {
    await assertSucceeds(setDoc(doc(db("alice"), "groups", "g2"), { name: "Le Taf", ownerId: "alice", memberIds: ["alice"] }));
    await assertFails(setDoc(doc(db("alice"), "groups", "g3"), { name: "Le Taf", ownerId: "alice", memberIds: ["alice", "bob"] }));
  });
  it("lists only my groups", async () => {
    await seed();
    await assertSucceeds(getDocs(query(collection(db("bob"), "groups"), where("memberIds", "array-contains", "bob"))));
    await assertFails(getDocs(collection(db("bob"), "groups")));
  });
  it("lets anyone read one group by id", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(db("dave"), "groups", "g1")));
  });
  it("lets a user join once, and not add others", async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(db("dave"), "groups", "g1"), { memberIds: arrayUnion("dave") }));
    await assertFails(updateDoc(doc(db("erin"), "groups", "g1"), { memberIds: arrayUnion("erin", "frank") }));
    await assertFails(updateDoc(doc(db("erin"), "groups", "g1"), { name: "Pwned", memberIds: arrayUnion("erin") }));
  });
  it("caps groups at 30 members", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const members = Array.from({ length: 30 }, (_, i) => `u${i}`);
      await setDoc(doc(ctx.firestore(), "groups", "full"), { name: "Full", ownerId: "u0", memberIds: members });
    });
    await assertFails(updateDoc(doc(db("dave"), "groups", "full"), { memberIds: arrayUnion("dave") }));
  });
  it("lets a member leave but not the owner", async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(db("bob"), "groups", "g1"), { memberIds: arrayRemove("bob") }));
    await assertFails(updateDoc(doc(db("alice"), "groups", "g1"), { memberIds: arrayRemove("alice") }));
  });
  it("lets the owner rename and remove members, not others", async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(db("alice"), "groups", "g1"), { name: "La Coloc 2", memberIds: arrayRemove("carol") }));
    await assertFails(updateDoc(doc(db("bob"), "groups", "g1"), { name: "Chez Bob" }));
    await assertFails(updateDoc(doc(db("bob"), "groups", "g1"), { memberIds: arrayRemove("alice") }));
  });
});

describe("playlist, users, pushTokens", () => {
  it("lets members read the playlist, nobody write it", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(db("bob"), "groups", "g1", "playlist")));
    await assertFails(getDocs(collection(db("dave"), "groups", "g1", "playlist")));
    await assertFails(setDoc(doc(db("alice"), "groups", "g1", "playlist", "x"), { votes: 99 }));
  });
  it("lets me write my profile and push token, never read tokens", async () => {
    await assertSucceeds(setDoc(doc(db("alice"), "users", "alice"), { name: "Alice", createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db("alice"), "users", "bob"), { name: "Bob", createdAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(db("bob"), "users", "alice")));
    await assertSucceeds(setDoc(doc(db("alice"), "pushTokens", "alice"), { token: "ExponentPushToken[x]", updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(db("bob"), "pushTokens", "alice")));
  });
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run :

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
cd functions && npm run test:emulator
```

Expected : FAIL. Soit l'émulateur refuse de démarrer faute de `firestore.rules`, soit le test lève `ENOENT: no such file or directory, open '../firestore.rules'`.

- [ ] **Step 3 : Implémenter les règles**

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

- [ ] **Step 4 : Vérifier que ça passe**

Run : `cd functions && npm run test:emulator` (avec Java 21 exporté)
Expected : PASS, 21 tests.

- [ ] **Step 5 : Vérifier que les tests mordent**

Retirer temporairement la ligne `&& hasPostedOn(date, uid)` de la règle des votes, puis relancer `npm run test:emulator`.
Expected : FAIL sur `rejects self vote, vote without post, vote for missing post`.
Remettre la ligne, relancer : PASS, 21 tests.

- [ ] **Step 6 : Commit**

```bash
git add firestore.rules functions/test/emulator/rules.test.ts
git commit -m "feat(firestore): add security rules with emulator tests"
```

---

### Task 3: Décision du tick et tirage du créneau

**Files:**
- Create: `functions/src/types.ts`
- Create: `functions/src/schedule.ts`
- Test: `functions/test/unit/schedule.test.ts`

**Interfaces :**
- Consomme : `addMinutes` et `parisTimeToDate` (tâche 1).
- Produit :
  - `functions/src/types.ts` : `DayStatus`, `Track`, `DayDoc`, `PostDoc`, `GroupDoc`, `VoteDoc`, `PlaylistEntryDoc` (champs ci-dessous) ;
  - `functions/src/schedule.ts` :
    - constantes `FIRST_DROP_MINUTE`, `LAST_DROP_MINUTE`, `SLOT_MINUTES`, `REMINDER_DELAY_MINUTES`, `RESULTS_MINUTE` ;
    - `interface DayState { date; status; dropAt: Date; remindedAt: Date | null; resultsSentAt: Date | null }` ;
    - `interface TickState { now: Date; todayKey: string; today: DayState | null; yesterday: DayState | null; unclosedPastKeys: string[] }` ;
    - `type Action = { type: "close" | "create" | "drop" | "remind" | "results"; date: string }` (union discriminée) ;
    - `pickDropAt(dateKey: string, random: () => number): Date` ;
    - `decideActions(state: TickState): Action[]`.

- [ ] **Step 1 : Écrire le test qui échoue**

`functions/test/unit/schedule.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { decideActions, pickDropAt, type DayState, type TickState } from "../../src/schedule.js";

const at = (iso: string) => new Date(iso);

function day(overrides: Partial<DayState> = {}): DayState {
  return {
    date: "2026-09-14",
    status: "pending",
    dropAt: at("2026-09-14T15:00:00+02:00"),
    remindedAt: null,
    resultsSentAt: null,
    ...overrides,
  };
}

function state(overrides: Partial<TickState> = {}): TickState {
  return {
    now: at("2026-09-14T12:00:00+02:00"),
    todayKey: "2026-09-14",
    today: day(),
    yesterday: null,
    unclosedPastKeys: [],
    ...overrides,
  };
}

describe("pickDropAt", () => {
  it("picks 10:00 for the lowest random value", () => {
    expect(pickDropAt("2026-09-14", () => 0).toISOString()).toBe("2026-09-14T08:00:00.000Z");
  });
  it("picks 19:45 for the highest random value", () => {
    expect(pickDropAt("2026-09-14", () => 0.999999).toISOString()).toBe("2026-09-14T17:45:00.000Z");
  });
  it("lands on a 15-minute slot", () => {
    expect(pickDropAt("2026-09-14", () => 0.5).toISOString()).toBe("2026-09-14T13:00:00.000Z");
  });
});

describe("decideActions", () => {
  it("creates today when missing", () => {
    expect(decideActions(state({ today: null }))).toEqual([{ type: "create", date: "2026-09-14" }]);
  });

  it("does nothing before the drop", () => {
    expect(decideActions(state({ now: at("2026-09-14T14:45:00+02:00") }))).toEqual([]);
  });

  it("drops at or after dropAt", () => {
    expect(decideActions(state({ now: at("2026-09-14T15:00:00+02:00") }))).toEqual([
      { type: "drop", date: "2026-09-14" },
    ]);
    expect(decideActions(state({ now: at("2026-09-14T17:30:00+02:00") }))).toEqual([
      { type: "drop", date: "2026-09-14" },
    ]);
  });

  it("reminds 45 minutes after the drop, once", () => {
    const live = day({ status: "live" });
    expect(decideActions(state({ today: live, now: at("2026-09-14T15:30:00+02:00") }))).toEqual([]);
    expect(decideActions(state({ today: live, now: at("2026-09-14T15:45:00+02:00") }))).toEqual([
      { type: "remind", date: "2026-09-14" },
    ]);
    const reminded = day({ status: "live", remindedAt: at("2026-09-14T15:45:00+02:00") });
    expect(decideActions(state({ today: reminded, now: at("2026-09-14T16:00:00+02:00") }))).toEqual([]);
  });

  it("closes every unclosed past day before anything else", () => {
    expect(
      decideActions(state({ today: null, unclosedPastKeys: ["2026-09-12", "2026-09-13"] })),
    ).toEqual([
      { type: "close", date: "2026-09-12" },
      { type: "close", date: "2026-09-13" },
      { type: "create", date: "2026-09-14" },
    ]);
  });

  it("sends yesterday's results from 09:00, once", () => {
    const yesterday = day({ date: "2026-09-13", status: "closed" });
    expect(decideActions(state({ yesterday, now: at("2026-09-14T08:45:00+02:00") }))).toEqual([]);
    expect(decideActions(state({ yesterday, now: at("2026-09-14T09:00:00+02:00") }))).toEqual([
      { type: "results", date: "2026-09-13" },
    ]);
    const sent = day({ date: "2026-09-13", status: "closed", resultsSentAt: at("2026-09-14T09:00:00+02:00") });
    expect(decideActions(state({ yesterday: sent, now: at("2026-09-14T09:15:00+02:00") }))).toEqual([]);
  });

  it("waits for yesterday to be closed before sending results", () => {
    const yesterday = day({ date: "2026-09-13", status: "live" });
    expect(
      decideActions(state({ yesterday, unclosedPastKeys: ["2026-09-13"], now: at("2026-09-14T09:00:00+02:00") })),
    ).toEqual([{ type: "close", date: "2026-09-13" }]);
  });
});
```

- [ ] **Step 2 : Vérifier qu'il échoue**

Run : `cd functions && npx vitest run test/unit/schedule.test.ts`
Expected : FAIL, l'import `../../src/schedule.js` est introuvable.

- [ ] **Step 3 : Implémenter**

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

- [ ] **Step 4 : Vérifier que ça passe**

Run : `cd functions && npx vitest run test/unit/schedule.test.ts`
Expected : PASS, 10 tests.

- [ ] **Step 5 : Commit**

```bash
git add functions/src/types.ts functions/src/schedule.ts functions/test/unit/schedule.test.ts
git commit -m "feat(functions): decide tick actions and pick drop slot"
```

---

### Task 4: Calcul des gagnants

**Files:**
- Create: `functions/src/winners.ts`
- Test: `functions/test/unit/winners.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit :
  - `interface VoteInput { voterUid: string; postUid: string }` ;
  - `interface Winner { postUid: string; votes: number }` ;
  - `computeWinners(votes: VoteInput[], eligibleUids: ReadonlySet<string>): Winner[]`. `eligibleUids` = membres du groupe ayant posté ce jour-là. Les ex æquo gagnent tous (triés par uid), et sans vote il n'y a pas de gagnant.

- [ ] **Step 1 : Écrire le test qui échoue**

`functions/test/unit/winners.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { computeWinners } from "../../src/winners.js";

const eligible = new Set(["alice", "bob", "carol", "dave"]);

describe("computeWinners", () => {
  it("returns the most voted post", () => {
    const votes = [
      { voterUid: "alice", postUid: "bob" },
      { voterUid: "carol", postUid: "bob" },
      { voterUid: "bob", postUid: "alice" },
    ];
    expect(computeWinners(votes, eligible)).toEqual([{ postUid: "bob", votes: 2 }]);
  });

  it("returns every tied post, sorted by uid", () => {
    const votes = [
      { voterUid: "alice", postUid: "carol" },
      { voterUid: "carol", postUid: "alice" },
    ];
    expect(computeWinners(votes, eligible)).toEqual([
      { postUid: "alice", votes: 1 },
      { postUid: "carol", votes: 1 },
    ]);
  });

  it("returns no winner without votes", () => {
    expect(computeWinners([], eligible)).toEqual([]);
  });

  it("ignores self votes and votes involving non-eligible users", () => {
    const votes = [
      { voterUid: "alice", postUid: "alice" },
      { voterUid: "erin", postUid: "bob" },
      { voterUid: "alice", postUid: "erin" },
    ];
    expect(computeWinners(votes, eligible)).toEqual([]);
  });
});
```

- [ ] **Step 2 : Vérifier qu'il échoue**

Run : `cd functions && npx vitest run test/unit/winners.test.ts`
Expected : FAIL, l'import `../../src/winners.js` est introuvable.

- [ ] **Step 3 : Implémenter**

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

- [ ] **Step 4 : Vérifier que ça passe**

Run : `cd functions && npx vitest run test/unit/winners.test.ts`
Expected : PASS, 4 tests.

- [ ] **Step 5 : Commit**

```bash
git add functions/src/winners.ts functions/test/unit/winners.test.ts
git commit -m "feat(functions): compute daily winners with ties"
```

---

### Task 5: Textes des notifications

**Files:**
- Create: `functions/src/messages.ts`
- Test: `functions/test/unit/messages.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit :
  - `interface PushPayload { title: string; body: string }` ;
  - `dropMessage(theme: string): PushPayload` ;
  - `reminderMessage(): PushPayload` ;
  - `resultsMessage(groupName: string, winners: { name: string; title: string }[]): PushPayload`.

- [ ] **Step 1 : Écrire le test qui échoue**

`functions/test/unit/messages.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { dropMessage, reminderMessage, resultsMessage } from "../../src/messages.js";

describe("messages", () => {
  it("announces the drop with the theme", () => {
    expect(dropMessage("Le son que ton chat écoute en cachette")).toEqual({
      title: "Angelus",
      body: "C'est l'heure. Le son que ton chat écoute en cachette. Tu as 1 h pour poster.",
    });
  });

  it("keeps a theme's own final punctuation", () => {
    expect(dropMessage("Qui a volé le goûter ?").body).toBe("C'est l'heure. Qui a volé le goûter ? Tu as 1 h pour poster.");
  });

  it("reminds", () => {
    expect(reminderMessage().body).toBe("Plus que 15 min pour poster à l'heure.");
  });

  it("announces a single winner", () => {
    expect(resultsMessage("La Coloc", [{ name: "Inès", title: "Everybody Wants to Be a Cat" }])).toEqual({
      title: "La Coloc",
      body: "Inès gagne La Coloc avec Everybody Wants to Be a Cat.",
    });
  });

  it("announces tied winners", () => {
    const winners = [
      { name: "Inès", title: "A" },
      { name: "Tom", title: "B" },
      { name: "Léa", title: "C" },
    ];
    expect(resultsMessage("La Coloc", winners).body).toBe("Inès, Tom et Léa gagnent La Coloc ex æquo.");
  });
});
```

- [ ] **Step 2 : Vérifier qu'il échoue**

Run : `cd functions && npx vitest run test/unit/messages.test.ts`
Expected : FAIL, l'import `../../src/messages.js` est introuvable.

- [ ] **Step 3 : Implémenter**

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

- [ ] **Step 4 : Vérifier que ça passe**

Run : `cd functions && npx vitest run test/unit/messages.test.ts`
Expected : PASS, 5 tests.

- [ ] **Step 5 : Commit**

```bash
git add functions/src/messages.ts functions/test/unit/messages.test.ts
git commit -m "feat(functions): add French push notification copy"
```

---

### Task 6: Génération du thème (Gemini et secours)

**Files:**
- Create: `functions/src/theme.ts`
- Test: `functions/test/unit/theme.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit :
  - `GEMINI_MODEL` (`"gemini-3.8-flash"`) et `FALLBACK_THEMES: string[]` ;
  - `buildThemePrompt(recentThemes: string[]): string` ;
  - `parseThemeResponse(text: string | undefined): string | null` ;
  - `pickFallbackTheme(recentThemes: string[], random: () => number): string` ;
  - `generateTheme(apiKey: string, recentThemes: string[]): Promise<string | null>`, qui ne lève jamais d'erreur : `null` en cas d'échec.

- [ ] **Step 1 : Écrire le test qui échoue**

`functions/test/unit/theme.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { buildThemePrompt, FALLBACK_THEMES, parseThemeResponse, pickFallbackTheme } from "../../src/theme.js";

describe("parseThemeResponse", () => {
  it("extracts and trims the theme", () => {
    expect(parseThemeResponse('{"theme": "  La berceuse d\'un dragon insomniaque. "}')).toBe(
      "La berceuse d'un dragon insomniaque",
    );
  });

  it("rejects empty, malformed, or out-of-range answers", () => {
    expect(parseThemeResponse(undefined)).toBeNull();
    expect(parseThemeResponse("pas du json")).toBeNull();
    expect(parseThemeResponse('{"titre": "x"}')).toBeNull();
    expect(parseThemeResponse('{"theme": 42}')).toBeNull();
    expect(parseThemeResponse('{"theme": "ok"}')).toBeNull();
    expect(parseThemeResponse(JSON.stringify({ theme: "a".repeat(121) }))).toBeNull();
  });
});

describe("pickFallbackTheme", () => {
  it("avoids recent themes", () => {
    const recent = FALLBACK_THEMES.slice(1);
    expect(pickFallbackTheme(recent, () => 0.7)).toBe(FALLBACK_THEMES[0]);
  });

  it("reuses the full list when every theme is recent", () => {
    expect(pickFallbackTheme(FALLBACK_THEMES, () => 0)).toBe(FALLBACK_THEMES[0]);
  });
});

describe("buildThemePrompt", () => {
  it("lists recent themes to avoid", () => {
    const prompt = buildThemePrompt(["Le tube préféré de ta machine à laver"]);
    expect(prompt).toContain("- Le tube préféré de ta machine à laver");
    expect(prompt).toContain('{"theme": "..."}');
  });

  it("omits the recent section when there is no history", () => {
    expect(buildThemePrompt([])).not.toContain("thèmes récents");
  });
});
```

- [ ] **Step 2 : Vérifier qu'il échoue**

Run : `cd functions && npx vitest run test/unit/theme.test.ts`
Expected : FAIL, l'import `../../src/theme.js` est introuvable.

- [ ] **Step 3 : Implémenter**

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

- [ ] **Step 4 : Vérifier que ça passe**

Run : `cd functions && npx vitest run test/unit/theme.test.ts`
Expected : PASS, 6 tests.

- [ ] **Step 5 : Commit**

```bash
git add functions/src/theme.ts functions/test/unit/theme.test.ts
git commit -m "feat(functions): generate daily theme with Gemini and fallback list"
```

---

### Task 7: Envoi des push Expo

**Files:**
- Create: `functions/src/push.ts`
- Test: `functions/test/unit/push.test.ts`

**Interfaces :**
- Consomme : `PushPayload` (tâche 5).
- Produit :
  - `interface PushTarget { uid: string; token: string }` ;
  - `type SendPush = (targets: PushTarget[], payload: PushPayload) => Promise<string[]>` : résout avec les uids dont le token est mort ;
  - `interface ExpoClient { chunkPushNotifications; sendPushNotificationsAsync }` ;
  - `createExpoSender(expo?: ExpoClient): SendPush`.

- [ ] **Step 1 : Écrire le test qui échoue**

`functions/test/unit/push.test.ts` :

```ts
import type { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { describe, expect, it } from "vitest";
import { createExpoSender, type ExpoClient } from "../../src/push.js";

function fakeExpo(ticketFor: (message: ExpoPushMessage) => ExpoPushTicket) {
  const sent: ExpoPushMessage[] = [];
  const client: ExpoClient = {
    chunkPushNotifications: (messages) => [messages.slice(0, 1), messages.slice(1)].filter((c) => c.length > 0),
    sendPushNotificationsAsync: async (messages) => {
      sent.push(...messages);
      return messages.map(ticketFor);
    },
  };
  return { client, sent };
}

describe("createExpoSender", () => {
  it("sends the payload to every valid token", async () => {
    const { client, sent } = fakeExpo(() => ({ status: "ok", id: "t" }));
    const dead = await createExpoSender(client)(
      [
        { uid: "alice", token: "ExponentPushToken[aaa]" },
        { uid: "bob", token: "ExponentPushToken[bbb]" },
      ],
      { title: "Angelus", body: "Hello" },
    );
    expect(dead).toEqual([]);
    expect(sent).toEqual([
      { to: "ExponentPushToken[aaa]", sound: "default", title: "Angelus", body: "Hello" },
      { to: "ExponentPushToken[bbb]", sound: "default", title: "Angelus", body: "Hello" },
    ]);
  });

  it("reports malformed and unregistered tokens as dead, across chunks", async () => {
    const { client } = fakeExpo((message) =>
      message.to === "ExponentPushToken[bbb]"
        ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }
        : { status: "ok", id: "t" },
    );
    const dead = await createExpoSender(client)(
      [
        { uid: "alice", token: "ExponentPushToken[aaa]" },
        { uid: "carol", token: "not-a-token" },
        { uid: "bob", token: "ExponentPushToken[bbb]" },
      ],
      { title: "Angelus", body: "Hello" },
    );
    expect(dead.sort()).toEqual(["bob", "carol"]);
  });
});
```

- [ ] **Step 2 : Vérifier qu'il échoue**

Run : `cd functions && npx vitest run test/unit/push.test.ts`
Expected : FAIL, l'import `../../src/push.js` est introuvable.

- [ ] **Step 3 : Implémenter**

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

- [ ] **Step 4 : Vérifier que ça passe**

Run : `cd functions && npm test`
Expected : PASS, 6 fichiers et 33 tests (toute la suite unitaire).

- [ ] **Step 5 : Commit**

```bash
git add functions/src/push.ts functions/test/unit/push.test.ts
git commit -m "feat(functions): send Expo push and report dead tokens"
```

---

### Task 8: Orchestration `tick` et fonction planifiée

**Files:**
- Create: `functions/src/tick.ts`
- Create: `functions/src/index.ts`
- Test: `functions/test/emulator/tick.test.ts`

**Interfaces :**
- Consomme :
  - tâche 1 : `parisDateKey`, `previousDateKey` ;
  - tâche 3 : `decideActions`, `pickDropAt`, `Action`, `DayState`, et les types ;
  - tâche 4 : `computeWinners` ;
  - tâche 5 : `dropMessage`, `reminderMessage`, `resultsMessage`, `PushPayload` ;
  - tâche 6 : `pickFallbackTheme`, `generateTheme` ;
  - tâche 7 : `PushTarget`, `SendPush`, `createExpoSender`.
- Produit :
  - `interface TickDeps { db: Firestore; now: Date; random: () => number; generateTheme: (recentThemes: string[]) => Promise<string | null>; sendPush: SendPush }` ;
  - `runTick(deps: TickDeps): Promise<Action[]>` ;
  - export Cloud Function `tick` (`functions/src/index.ts`).

- [ ] **Step 1 : Écrire le test qui échoue**

`functions/test/emulator/tick.test.ts` :

```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { PushPayload } from "../../src/messages.js";
import type { PushTarget } from "../../src/push.js";
import { FALLBACK_THEMES } from "../../src/theme.js";
import { runTick, type TickDeps } from "../../src/tick.js";

const PROJECT_ID = "demo-angelus";
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
const TRACK = { deezerId: 3135553, title: "The Lovecats", artist: "The Cure", cover: "https://cdn/x.jpg" };

interface Sent {
  uids: string[];
  payload: PushPayload;
}

function harness(options: { theme?: string | null; deadUids?: string[] } = {}) {
  const sent: Sent[] = [];
  const deps = (nowIso: string): TickDeps => ({
    db,
    now: new Date(nowIso),
    random: () => 0.5,
    generateTheme: async () => (options.theme === undefined ? "Le son que ton chat écoute en cachette" : options.theme),
    sendPush: async (targets: PushTarget[], payload: PushPayload) => {
      sent.push({ uids: targets.map((t) => t.uid).sort(), payload });
      return options.deadUids ?? [];
    },
  });
  return { sent, tick: (nowIso: string) => runTick(deps(nowIso)) };
}

async function seedFriends() {
  for (const [uid, name] of [["alice", "Alice"], ["bob", "Bob"], ["carol", "Carol"]]) {
    await db.doc(`users/${uid}`).set({ name, createdAt: Timestamp.now() });
    await db.doc(`pushTokens/${uid}`).set({ token: `ExponentPushToken[${uid}]`, updatedAt: Timestamp.now() });
  }
  await db.doc("groups/g1").set({ name: "La Coloc", ownerId: "alice", memberIds: ["alice", "bob", "carol"] });
}

beforeEach(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
});

describe("runTick", () => {
  it("runs a whole day: create, drop, remind, close, results", async () => {
    await seedFriends();
    const { sent, tick } = harness();

    expect(await tick("2026-09-14T00:05:00+02:00")).toEqual([{ type: "create", date: "2026-09-14" }]);
    const created = (await db.doc("days/2026-09-14").get()).data()!;
    expect(created.status).toBe("pending");
    expect(created.theme).toBe("Le son que ton chat écoute en cachette");
    expect(created.dropAt.toDate().toISOString()).toBe("2026-09-14T13:00:00.000Z");

    expect(await tick("2026-09-14T14:45:00+02:00")).toEqual([]);

    expect(await tick("2026-09-14T15:00:00+02:00")).toEqual([{ type: "drop", date: "2026-09-14" }]);
    expect((await db.doc("days/2026-09-14").get()).get("status")).toBe("live");
    expect(sent[0]).toEqual({
      uids: ["alice", "bob", "carol"],
      payload: { title: "Angelus", body: "C'est l'heure. Le son que ton chat écoute en cachette. Tu as 1 h pour poster." },
    });

    await db.doc("days/2026-09-14/posts/alice").set({ track: { ...TRACK, title: "Stray Cat Strut" }, postedAt: Timestamp.now(), late: false });
    await db.doc("days/2026-09-14/posts/bob").set({ track: TRACK, postedAt: Timestamp.now(), late: false });
    await db.doc("groups/g1/days/2026-09-14/votes/alice").set({ postUid: "bob", updatedAt: Timestamp.now() });

    expect(await tick("2026-09-14T15:45:00+02:00")).toEqual([{ type: "remind", date: "2026-09-14" }]);
    expect(sent[1]).toEqual({ uids: ["carol"], payload: { title: "Angelus", body: "Plus que 15 min pour poster à l'heure." } });
    expect(await tick("2026-09-14T16:00:00+02:00")).toEqual([]);

    expect(await tick("2026-09-15T00:00:00+02:00")).toEqual([
      { type: "close", date: "2026-09-14" },
      { type: "create", date: "2026-09-15" },
    ]);
    expect((await db.doc("days/2026-09-14").get()).get("status")).toBe("closed");
    expect((await db.doc("groups/g1/playlist/2026-09-14_bob").get()).data()).toEqual({
      date: "2026-09-14",
      theme: "Le son que ton chat écoute en cachette",
      winnerUid: "bob",
      winnerName: "Bob",
      track: TRACK,
      votes: 1,
    });

    expect(await tick("2026-09-15T08:45:00+02:00")).toEqual([]);
    expect(await tick("2026-09-15T09:00:00+02:00")).toEqual([{ type: "results", date: "2026-09-14" }]);
    expect(sent[2]).toEqual({
      uids: ["alice", "bob", "carol"],
      payload: { title: "La Coloc", body: "Bob gagne La Coloc avec The Lovecats." },
    });
    expect(await tick("2026-09-15T09:15:00+02:00")).toEqual([]);
  });

  it("falls back to a canned theme when Gemini returns nothing", async () => {
    const { tick } = harness({ theme: null });
    await tick("2026-09-14T00:05:00+02:00");
    expect(FALLBACK_THEMES).toContain((await db.doc("days/2026-09-14").get()).get("theme"));
  });

  it("deletes push tokens reported dead", async () => {
    await seedFriends();
    const { tick } = harness({ deadUids: ["carol"] });
    await tick("2026-09-14T00:05:00+02:00");
    await tick("2026-09-14T15:00:00+02:00");
    expect((await db.doc("pushTokens/carol").get()).exists).toBe(false);
    expect((await db.doc("pushTokens/alice").get()).exists).toBe(true);
  });

  it("closes a day that never dropped, without winners", async () => {
    await seedFriends();
    await db.doc("days/2026-09-13").set({ theme: "x", dropAt: Timestamp.fromDate(new Date("2026-09-13T17:00:00Z")), status: "pending" });
    const { tick } = harness();
    expect(await tick("2026-09-14T00:05:00+02:00")).toEqual([
      { type: "close", date: "2026-09-13" },
      { type: "create", date: "2026-09-14" },
    ]);
    expect((await db.doc("days/2026-09-13").get()).get("status")).toBe("closed");
    expect((await db.collection("groups/g1/playlist").get()).empty).toBe(true);
  });
});
```

- [ ] **Step 2 : Vérifier qu'il échoue**

Run : `cd functions && npm run test:emulator` (avec Java 21 exporté)
Expected : FAIL sur `tick.test.ts`, l'import `../../src/tick.js` est introuvable. Les 21 tests de règles passent toujours.

- [ ] **Step 3 : Implémenter l'orchestration**

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

- [ ] **Step 4 : Déclarer la fonction planifiée**

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

- [ ] **Step 5 : Vérifier que tout passe**

Run :

```bash
cd functions
npm run build
npm test
npm run test:emulator
node -e "import('./lib/index.js').then((m) => console.log(Object.keys(m)))"
```

Expected :
- `tsc` sans erreur ;
- unitaires : PASS, 33 tests ;
- émulateur : PASS, 2 fichiers et 25 tests ;
- la dernière commande affiche `[ 'tick' ]`.

- [ ] **Step 6 : Commit**

```bash
git add functions/src/tick.ts functions/src/index.ts functions/test/emulator/tick.test.ts
git commit -m "feat(functions): orchestrate daily tick as scheduled function"
```

---

### Task 9: Déploiement sur Firebase

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

Expected : un thème absurde en français s'affiche, pas `null`. Si `null` s'affiche, lire l'avertissement logué : clé invalide ou modèle `gemini-3.8-flash` indisponible. Dans ce dernier cas, remplacer `GEMINI_MODEL` par un modèle Flash listé sur https://ai.google.dev/gemini-api/docs/models, puis relancer `npm test`.

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
