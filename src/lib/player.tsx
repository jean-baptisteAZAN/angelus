import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Linking } from "react-native";

interface PlayerState {
  /** Key of the track loaded in the player (e.g. a post uid or a Deezer id), or null. */
  currentKey: string | null;
  playing: boolean;
  progress: number;
  didJustFinish: boolean;
  toggle: (key: string, resolveUrl: () => Promise<string | null>, deezerId?: number) => Promise<void>;
  stop: () => void;
}

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [currentKey, setCurrentKey] = useState<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const toggle = useCallback(
    async (key: string, resolveUrl: () => Promise<string | null>, deezerId?: number) => {
      if (key === currentKey) {
        if (status.playing) {
          player.pause();
        } else {
          if (status.didJustFinish) player.seekTo(0);
          player.play();
        }
        return;
      }
      const url = await resolveUrl().catch(() => null);
      if (!url) {
        Alert.alert(
          "Extrait indisponible",
          "Deezer ne fournit pas d'extrait pour ce son.",
          deezerId
            ? [
                { text: "Fermer", style: "cancel" },
                { text: "Ouvrir dans Deezer", onPress: () => Linking.openURL(`https://www.deezer.com/track/${deezerId}`) },
              ]
            : undefined,
        );
        return;
      }
      player.replace({ uri: url });
      player.play();
      setCurrentKey(key);
    },
    [currentKey, player, status.playing, status.didJustFinish],
  );

  const stop = useCallback(() => {
    player.pause();
    setCurrentKey(null);
  }, [player]);

  const value = useMemo<PlayerState>(
    () => ({
      currentKey,
      playing: status.playing,
      progress: status.duration > 0 ? status.currentTime / status.duration : 0,
      didJustFinish: status.didJustFinish,
      toggle,
      stop,
    }),
    [currentKey, status.playing, status.currentTime, status.duration, status.didJustFinish, toggle, stop],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerState {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider");
  return value;
}
