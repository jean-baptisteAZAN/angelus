import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  font,
  foregroundStyle,
  lineLimit,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

export type TodayWidgetProps = {
  /** waiting: no theme yet. open: posted window. late: past the hour. posted: my song is in. closed: votes over. */
  state: "waiting" | "open" | "late" | "posted" | "closed";
  theme: string;
  /** Paris wall-clock time the on-time window ends, e.g. "15:37". */
  deadline: string;
  postedCount: number;
  memberCount: number;
};

const TONER = "#000000";
const FLUO = "#F2FF3A";

function headline(props: TodayWidgetProps): string {
  if (props.state === "waiting") return "Le thème n'est pas encore tombé";
  return props.theme;
}

function status(props: TodayWidgetProps): string {
  switch (props.state) {
    case "waiting":
      return "Il tombe entre 10 h et 20 h";
    case "open":
      return `À l'heure jusqu'à ${props.deadline}`;
    case "late":
      return "En retard, poste avant minuit";
    case "posted":
      return `${props.postedCount} sur ${props.memberCount} ont posté`;
    case "closed":
      return "Votes terminés";
  }
}

const TodayWidgetLayout = (props: TodayWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const compact = environment.widgetFamily === "systemSmall";
  return (
    <VStack
      alignment="leading"
      spacing={compact ? 6 : 10}
      modifiers={[widgetURL("angelus:///"), padding({ all: 2 })]}
    >
      <HStack>
        <Text modifiers={[font({ size: 12, weight: "bold", design: "monospaced" }), foregroundStyle(TONER)]}>
          Angelus
        </Text>
        <Spacer />
      </HStack>

      <Text
        modifiers={[
          font({ size: compact ? 19 : 24, weight: "black" }),
          foregroundStyle(TONER),
          lineLimit(compact ? 4 : 3),
        ]}
      >
        {headline(props)}
      </Text>

      <Spacer />

      <Text
        modifiers={[
          font({ size: 12, weight: "bold", design: "monospaced" }),
          foregroundStyle(TONER),
          background(props.state === "posted" || props.state === "closed" ? "#00000000" : FLUO),
          lineLimit(2),
        ]}
      >
        {status(props)}
      </Text>
    </VStack>
  );
};

export default createWidget("TodayWidget", TodayWidgetLayout);
