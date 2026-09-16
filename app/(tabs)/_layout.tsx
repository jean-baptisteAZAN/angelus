import { NativeTabs } from "expo-router/unstable-native-tabs";
import { colors } from "@/ui/theme";

export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.toner}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="antenna.radiowaves.left.and.right" />
        <NativeTabs.Trigger.Label>Aujourd'hui</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="playlist">
        <NativeTabs.Trigger.Icon sf={{ default: "recordingtape", selected: "recordingtape" }} />
        <NativeTabs.Trigger.Label>Playlist</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="group">
        <NativeTabs.Trigger.Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <NativeTabs.Trigger.Label>Groupe</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
