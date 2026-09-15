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
