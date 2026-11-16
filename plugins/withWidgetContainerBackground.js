const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const ENTRY_VIEW = "WidgetsEntryView(entry: entry)";
const MODIFIER = "angelusWidgetBackground()";

/**
 * iOS 17+ renders "Please adopt containerBackground API" for any widget whose root view does not
 * call containerBackground. expo-widgets 57 only exposes it as an @expo/ui modifier, which lands
 * too deep in the hierarchy to count (expo/expo#49015 fixes this upstream but is unreleased).
 * This patches the widget Swift that prebuild generates so the background sits on the entry view.
 * The widget target deploys below iOS 17, so the call is gated behind #available.
 */
module.exports = function withWidgetContainerBackground(config, { color } = {}) {
  const [r, g, b] = hexToRgb(color ?? "#E9E9E5");
  const swiftColor = `Color(red: ${r}, green: ${g}, blue: ${b})`;
  const extension = `
extension View {
  @ViewBuilder
  func ${MODIFIER} -> some View {
    if #available(iOS 17.0, *) {
      self.containerBackground(${swiftColor}, for: .widget)
    } else {
      self.background(${swiftColor})
    }
  }
}
`;

  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, "ExpoWidgetsTarget");
      if (!fs.existsSync(dir)) return cfg;

      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".swift"))) {
        const filePath = path.join(dir, file);
        const source = fs.readFileSync(filePath, "utf8");
        if (!source.includes(ENTRY_VIEW) || source.includes(MODIFIER)) continue;
        fs.writeFileSync(filePath, source.replace(ENTRY_VIEW, `${ENTRY_VIEW}\n        .${MODIFIER}`) + extension);
      }
      return cfg;
    },
  ]);
};

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => (parseInt(value.slice(i, i + 2), 16) / 255).toFixed(4));
}
