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

/**
 * Re-authenticates with Apple, revokes the Apple token, deletes app data then the Firebase user.
 * Not atomic: if it fails halfway, running it again finishes the job.
 */
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
