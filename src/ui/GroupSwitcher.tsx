import { ActionSheetIOS, Pressable, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { Display, Type } from "./Text";

/** Group name as a title; tapping it lets you switch between your groups. */
export function GroupSwitcher({ title }: { title?: (groupName: string) => string }) {
  const { groups, selected, select } = useGroups();
  if (!selected) return null;

  const open = () => {
    if (groups.length < 2) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...groups.map((g) => g.name), "Annuler"], cancelButtonIndex: groups.length, title: "Changer de groupe" },
      (index) => {
        if (index < groups.length) select(groups[index].id);
      },
    );
  };

  const position = groups.findIndex((g) => g.id === selected.id) + 1;
  return (
    <Pressable onPress={open} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
      <Display size={34} style={{ flexShrink: 1 }}>
        {title ? title(selected.name) : selected.name}
        {groups.length > 1 ? " ⌄" : ""}
      </Display>
      {groups.length > 1 && (
        <View style={{ paddingBottom: 6 }}>
          <Type size={12}>
            {position} de tes {groups.length} groupes
          </Type>
        </View>
      )}
    </Pressable>
  );
}
