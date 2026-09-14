# Angelus — design V1

> Le BeReal de la musique : chaque jour, à une heure surprise, un thème absurde tombe. Chacun partage un son qui colle au thème avec ses groupes d'amis, et chaque groupe vote pour son préféré.

Date : 2026-09-14
Statut : validé (DA : Radio pirate)

## 1. Principes

- Petite app entre amis : on choisit toujours la solution la plus simple qui marche. Pas d'infra superflue, sécurité « raisonnable », pas blindée.
- iOS uniquement en V1.
- Fuseau unique : Europe/Paris. Une « journée » est identifiée par sa date `YYYY-MM-DD` en heure de Paris.

## 2. Règles du jeu

### Journée type

| Moment | Ce qui se passe |
|---|---|
| 00:00 | Clôture de la veille. Création de la journée : thème généré, créneau de drop tiré au sort. Le thème reste secret. |
| Drop (créneau aléatoire entre 10:00 et 19:45, pas de 15 min) | Thème publié, notification à tous. |
| Drop → drop + 1 h | Un post dans cette fenêtre est « à l'heure ». |
| Drop + 45 min | Rappel aux users qui n'ont pas encore posté. |
| Drop + 1 h → 23:59 | Poster reste possible, le post est marqué « en retard ». |
| 00:00 | Votes clos, gagnants calculés et ajoutés à la playlist de chaque groupe. |
| 09:00 (lendemain) | Notification des résultats, par groupe. |

### Poster

- Un seul son par user et par jour, **définitif** (pas de modification ni de suppression).
- Ce son est visible dans **tous** les groupes du user, y compris ceux qu'il rejoint plus tard dans la journée.
- Tant qu'un user n'a pas posté, il voit qui a posté mais les sons sont masqués (pochettes floutées). Poster débloque tout.

### Voter

- Un vote par user, par groupe et par jour.
- Il faut avoir posté pour voter. Impossible de voter pour soi.
- On peut changer ou retirer son vote jusqu'à minuit.
- Compteurs **visibles en live**, avec le nom des votants.
- Gagnant = le son qui a le plus de votes dans le groupe. En cas d'égalité, tous les ex æquo gagnent. Si personne n'a voté, il n'y a pas de gagnant ce jour-là.

### Groupes

- Un user peut appartenir à plusieurs groupes. 30 membres max par groupe.
- Le créateur (owner) peut renommer le groupe et retirer des membres. Il ne peut pas quitter le groupe en V1.
- Un membre peut quitter le groupe.
- Pour rejoindre un groupe, on scanne un QR code qui contient `angelus://join/{gid}`.

### Thèmes

- Un thème global par jour, le même pour tout le monde.
- Ton décalé et absurde, en français. Exemples : « Le son que ton chat écoute en cachette », « La musique d'attente de l'enfer ».
- Générés par Gemini, qui reçoit les 60 derniers thèmes pour éviter les répétitions.
- Si Gemini échoue, on tire un thème dans une liste de secours codée en dur, pour que la journée ne saute jamais.

## 3. Périmètre V1

**Inclus :**
- connexion Apple ;
- pseudo ;
- créer, rejoindre (QR) et quitter un groupe ;
- thème du jour ;
- recherche Deezer avec extrait de 30 s ;
- poster ;
- voir les sons (après avoir posté) ;
- voter ;
- playlist des gagnants du groupe ;
- 3 notifications (drop, rappel, résultats) ;
- suppression de compte (exigence App Store).

**Exclus (V2+) :** streaks, classement, réactions, légendes, commentaires, Android, connexion Google, upload d'avatar, universal links.

## 4. Architecture

```
iOS app (Expo 57) ──lecture/écriture directe──▶ Firestore (règles de sécurité)
      │                                              ▲
      ├──fetch──▶ API Deezer (recherche, extraits)   │ Admin SDK
      │                                              │
      └──◀── push Expo ◀── Cloud Function `tick` (toutes les 15 min)
                                  │
                                  └──▶ Gemini (génération du thème)
```

- L'app n'appelle **aucune** fonction serveur. Toutes ses écritures passent directement par Firestore, contrôlées par les règles.
- La seule fonction serveur est `tick`, planifiée toutes les 15 minutes.
- Le projet Firebase doit être sur le plan **Blaze**, pour les fonctions planifiées et les appels réseau sortants.

## 5. Modèle de données (Firestore)

```
users/{uid}                          { name, createdAt }
pushTokens/{uid}                     { token, updatedAt }
groups/{gid}                         { name, ownerId, memberIds: string[] }   // memberIds.length ≤ 30
groups/{gid}/playlist/{date}_{uid}   { date, theme, winnerUid, winnerName, track, votes }
groups/{gid}/days/{date}/votes/{uid} { postUid, updatedAt }
days/{date}                          { theme, dropAt, status: 'pending'|'live'|'closed',
                                       remindedAt?, resultsSentAt? }
days/{date}/posts/{uid}              { track, postedAt, late }
```

`track` = `{ deezerId: number, title, artist, cover }`. On ne stocke pas l'URL de l'extrait : elle expire, donc l'app la redemande à Deezer (`GET https://api.deezer.com/track/{deezerId}`) au moment de la lecture.

- **Compteurs de votes** : aucun compteur n'est stocké. L'app écoute les votes du groupe (≤ 30 documents) et compte elle-même.
- **Groupes d'un user** : requête `groups where memberIds array-contains uid`.
- **Posts d'un groupe** : requête sur `days/{date}/posts` filtrée sur les `memberIds` du groupe. Le filtre `in` de Firestore accepte jusqu'à 30 valeurs, ce qui couvre la taille max d'un groupe.

## 6. Règles de sécurité (résumé)

| Chemin | Lecture | Écriture |
|---|---|---|
| `users/{uid}` | tout user connecté | soi uniquement |
| `pushTokens/{uid}` | personne | soi uniquement |
| `groups/{gid}` | `get` : tout user connecté (l'id sert de secret, pour afficher « Rejoindre La Coloc »). `list` : seulement ses groupes | **create** : `ownerId == auth.uid` et `memberIds == [auth.uid]`. **update par l'owner** : nom et retrait de membres. **update par un autre user** : s'ajouter soi-même (≤ 30, rien d'autre ne change) ou se retirer soi-même |
| `groups/{gid}/playlist/*` | membres | serveur uniquement |
| `groups/{gid}/days/{date}/votes/{uid}` | membres | `uid == auth.uid`, et en plus : votant membre du groupe, son post existe, `postUid` différent de lui, post cible existant, auteur de ce post membre du groupe, journée `live`. Suppression de son propre vote autorisée |
| `days/{date}` | si `status != 'pending'` | serveur uniquement |
| `days/{date}/posts/{uid}` | si le post du lecteur existe pour ce jour | **create** seulement : `uid == auth.uid`, journée `live`, `postedAt == request.time`, `late == request.time > dropAt + 1h`, champs de `track` bien typés. Pas d'update ni de delete |

Raccourcis assumés :
- un user qui a posté peut lire les posts du jour de n'importe qui s'il connaît son uid ;
- n'importe qui qui obtient un `gid` peut rejoindre le groupe.

## 7. Fonction `tick`

`onSchedule("*/15 * * * *", timeZone: "Europe/Paris")`.

Chaque exécution vérifie les conditions dans l'ordre et lance ce qui est dû. Toutes les conditions sont en « ≥ » et non en « = » : si une exécution est manquée, la suivante rattrape.

1. **Clôture** : pour toute journée non `closed` dont la date est antérieure à aujourd'hui (une journée restée `pending` est simplement clôturée, sans gagnant) :
   - pour chaque groupe, compter les votes dont le post cible existe ;
   - écrire les gagnants dans `groups/{gid}/playlist/{date}_{uid}` ;
   - passer la journée en `closed`.
2. **Création** : si `days/{aujourd'hui}` n'existe pas :
   - générer le thème (Gemini, sinon liste de secours) ;
   - tirer `dropAt` parmi les créneaux de 10:00 à 19:45 ;
   - écrire la journée avec `status: 'pending'`.
3. **Drop** : si `now ≥ dropAt` et `status == 'pending'` :
   - passer en `live` ;
   - envoyer un push à tous les tokens.
4. **Rappel** : si `now ≥ dropAt + 45 min`, `status == 'live'` et `remindedAt` absent :
   - envoyer un push aux users qui n'ont pas de post ce jour ;
   - renseigner `remindedAt`.
5. **Résultats** : si `now ≥ 09:00`, la veille est `closed` et `resultsSentAt` absent :
   - pour chaque groupe qui a au moins un gagnant, envoyer un push à ses membres ;
   - renseigner `resultsSentAt`.

Tolérance assumée : la journée reste `live` jusqu'au premier `tick` après minuit, donc jusqu'à 15 min de rab pour voter ou poster sur la veille.

La logique de décision (quelle action pour quel état et quelle heure) et le calcul des gagnants sont des **fonctions pures**, testées unitairement. Les effets (Firestore, Gemini, push) sont isolés autour.

**Push** : envoi via l'API Expo Push (`expo-server-sdk`). Les tokens qui reviennent en `DeviceNotRegistered` sont supprimés.

**Textes des notifications**
- Drop : « C'est l'heure. {thème}. Tu as 1 h pour poster. »
- Rappel : « Plus que 15 min pour poster à l'heure. »
- Résultats : « {prénom} gagne {groupe} avec {titre}. »

**Gemini** : SDK `@google/genai`, clé API stockée dans les secrets Firebase (`defineSecret`). Sortie JSON structurée `{ theme: string }`. Le modèle précis est choisi à l'implémentation.

## 8. Client

| Besoin | Choix |
|---|---|
| Navigation | `expo-router`. Native Tabs : Aujourd'hui / Playlist / Groupe. `Stack.Protected` pour la garde d'auth |
| Firebase | SDK JS `firebase@12+`. Session gardée via AsyncStorage |
| Auth | `expo-apple-authentication` + nonce (`expo-crypto`) → `signInWithCredential(OAuthProvider('apple.com'))`. Onboarding : pseudo, pré-rempli avec le nom Apple s'il est fourni |
| Recherche | `fetch` direct sur `api.deezer.com/search`, déclenché après 300 ms sans frappe |
| Audio | `expo-audio` : un lecteur unique pour toute l'app (un extrait à la fois), `setAudioModeAsync({ playsInSilentMode: true })` |
| QR | affichage : `react-native-qrcode-svg`. Scan : `expo-camera` `CameraView` avec `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}`. Deep link `angelus://join/{gid}` vers la route `join/[gid]` |
| Notifs | `expo-notifications` : `getExpoPushTokenAsync({ projectId })` écrit dans `pushTokens/{uid}`. Toucher une notif ouvre l'onglet Aujourd'hui |
| État | listeners Firestore (`onSnapshot`) dans des hooks, sans lib de state |
| Avatars | initiale sur une couleur dérivée de l'uid |

### Écrans

- **Connexion** : bouton Apple.
- **Onboarding** : pseudo, puis « Créer un groupe » ou « Scanner un code ».
- **Aujourd'hui**, selon l'état :
  - avant le drop : attente, sans heure affichée ;
  - avant d'avoir posté : thème, compte à rebours « à l'heure », sons des membres masqués, bouton « Choisir mon son » ;
  - après avoir posté : sons, lecture des extraits, votes live, temps restant avant la clôture ;
  - dans tous les cas : sélecteur de groupe.
- **Recherche** (modale) : champ, résultats, extrait, bouton « Poster ce son » avec une mention « définitif ».
- **Playlist** : gagnants du groupe (date, thème, son, gagnant, votes), bouton « Tout écouter ».
- **Groupe** : membres, QR d'invitation, scanner un code, quitter ou retirer un membre, réactiver les notifs, supprimer mon compte.

### Arborescence

```
app/
  (auth)/sign-in.tsx
  onboarding.tsx
  (tabs)/index.tsx          # Aujourd'hui
  (tabs)/playlist.tsx
  (tabs)/group.tsx
  search.tsx                # modale
  scan.tsx
  join/[gid].tsx
src/lib/     firebase.ts, deezer.ts, player.ts, notifications.ts, dates.ts
src/hooks/   useDay.ts, usePosts.ts, useVotes.ts, useGroups.ts
functions/src/  tick.ts, schedule.ts (logique pure), theme.ts, push.ts, close.ts
firestore.rules
firebase.json
```

## 9. Gestion d'erreurs

- **Deezer indisponible** : message « Recherche indisponible, réessaie » avec un bouton pour relancer. Si l'extrait ne charge pas, lien « Ouvrir dans Deezer ».
- **Hors ligne** : le cache Firestore sert la lecture. Poster ou voter hors ligne affiche une erreur explicite.
- **Notifications refusées** : bandeau dans l'onglet Groupe avec un lien vers les réglages.
- **Écriture refusée par les règles** (par exemple poster après minuit) : message clair (« La journée est terminée »).
- **Gemini en échec** : thème de secours (voir §2).

## 10. Tests

- **Règles Firestore** : `@firebase/rules-unit-testing` sur l'émulateur. Cas couverts :
  - thème invisible avant le drop ;
  - poster pour voir ;
  - post unique et définitif ;
  - `late` correct ;
  - vote : membre, a posté, pas pour soi, journée live ;
  - rejoindre un groupe : s'ajouter soi seulement, limite de 30.
- **`tick`** : tests unitaires des fonctions pures (décision d'action selon l'heure et l'état, tirage de créneau, calcul des gagnants et ex æquo).
- Pas de tests UI en V1.

## 11. Direction artistique

**Retenue : Radio pirate.** Maquette de référence : `docs/da/da-2-radio-pirate.html`. Les deux autres propositions (`da-1-liturgie-pop.html`, `da-3-hifi-de-nuit.html`) sont conservées pour mémoire.

Angelus émet comme une radio clandestine qui imprime son programme à la photocopieuse. Du papier, du toner, un surligneur et un marqueur rouge, rien d'autre.

### Palette

| Nom | Hex | Usage |
|---|---|---|
| Papier | `#E9E9E5` | fond, avec grain de toner léger |
| Papier neuf | `#F7F7F3` | bandes découpées, stickers, carte « ton son » |
| Toner | `#000000` | texte, traits, boutons pleins |
| Surligneur | `#F2FF3A` | compte à rebours, titre sélectionné, onglet actif. Toujours une ligne entière, jamais un seul mot |
| Marqueur | `#E3261B` | bâtons de vote, entourage « ton vote », badge « en retard ». Jamais porteur de texte (contraste) |
| Trame | `#8A8A86` | similis, éléments inactifs |

### Typographies

- **Big Shoulders Display**, graisses 800 et 900 : thèmes, titres de sons, gros chiffres, boutons.
- **Courier Prime**, 400 et 700 : tout le reste, comme tapé à la machine.
- Chargement via `expo-font` (paquets `@expo-google-fonts/big-shoulders-display` et `@expo-google-fonts/courier-prime`, à vérifier à l'implémentation).

### Composants signature

- **Thème** : bande de papier neuf découpée et scotchée de travers (±2° max), scotch translucide.
- **Votes live** : bâtons de comptage SVG irréguliers au marqueur rouge, barrés à 5. Ton vote est entouré au marqueur.
- **Pochettes** : simili noir et blanc tramé.
- **Sons pas encore débloqués** : photocopie ratée, barrée d'une trace de toner, avec un scotch « caché ».
- **Playlist** : jaquette de cassette dont la tranche porte « {groupe}, face A ».
- **Invitation** : QR code sur un sticker scotché, avec le code du groupe.
- **Animation unique** : tampon « Posté {heure} » quand on poste. Désactivée si l'utilisateur a demandé à réduire les animations.
- **Mise en page** : collage contrôlé sur une grille lisible, alignement à gauche, rotations légères sur quelques éléments seulement.

## 12. Points ouverts

- Distribution aux amis : TestFlight, avec le compte Apple Developer existant (qui sert aussi pour Sign in with Apple et les push en build EAS).
- Suppression de compte : révocation du token Apple exigée par Apple (`revokeAccessToken` du SDK Firebase Auth), à valider à l'implémentation.
