import { GoogleGenAI } from "@google/genai";
import * as logger from "firebase-functions/logger";

export const GEMINI_MODEL = "gemini-3.5-flash";

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
