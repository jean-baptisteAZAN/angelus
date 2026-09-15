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
