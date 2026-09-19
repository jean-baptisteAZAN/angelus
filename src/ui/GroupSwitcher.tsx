import { ActionSheetIOS, Pressable } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { Display } from "./Text";

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

  return (
    <Pressable onPress={open} accessibilityRole="button">
      <Display size={34}>
        {title ? title(selected.name) : selected.name}
        {groups.length > 1 ? " ⌄" : ""}
      </Display>
    </Pressable>
  );
}
