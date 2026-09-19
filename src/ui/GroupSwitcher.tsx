import { Pressable, ScrollView, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { Display } from "./Text";
import { colors } from "./theme";

/**
 * Group title plus, when there are several, a row of paper tabs to switch between them.
 * No popup: the tabs live on the page, like labels stuck on a folder.
 */
export function GroupSwitcher({ title }: { title?: (groupName: string) => string }) {
  const { groups, selected, select } = useGroups();
  if (!selected) return null;

  return (
    <View style={{ gap: 10 }}>
      <Display size={34}>{title ? title(selected.name) : selected.name}</Display>
      {groups.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          style={{ marginHorizontal: -2 }}
        >
          {groups.map((group) => {
            const active = group.id === selected.id;
            return (
              <Pressable
                key={group.id}
                onPress={() => select(group.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: 12,
                  borderWidth: 2,
                  borderColor: colors.toner,
                  borderBottomWidth: active ? 0 : 2,
                  backgroundColor: active ? colors.toner : colors.paperNew,
                }}
              >
                <Display size={20} color={active ? colors.paperNew : colors.toner}>
                  {group.name}
                </Display>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
