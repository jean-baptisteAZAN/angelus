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
