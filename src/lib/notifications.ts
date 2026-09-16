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
