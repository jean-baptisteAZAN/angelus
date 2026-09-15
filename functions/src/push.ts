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
