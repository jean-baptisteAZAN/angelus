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

export interface PushStatus {
  permission: PushPermission;
  /** False when the token could not be obtained or stored: the user gets no notification at all. */
  tokenSaved: boolean;
}

/** Asks for permission if needed and stores the Expo push token. */
export async function registerForPush(uid: string): Promise<PushStatus> {
  let { status } = await Notifications.getPermissionsAsync();
  if (status === "undetermined") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return { permission: status, tokenSaved: false };
  // The simulator has no push token; that is expected and not worth warning about.
  if (!Device.isDevice) return { permission: status, tokenSaved: true };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await savePushToken(uid, data);
    return { permission: status, tokenSaved: true };
  } catch (error) {
    console.warn("Push token registration failed", error);
    return { permission: status, tokenSaved: false };
  }
}

export async function getPushPermission(): Promise<PushPermission> {
  return (await Notifications.getPermissionsAsync()).status;
}
