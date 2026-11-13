import { Platform, useWindowDimensions, type ViewStyle } from "react-native";
import { colors } from "../theme";

// The app is designed for phone widths; on a wide browser window the app
// screens (tabs, settings, profile, admin) are shown as a centered column
// instead of stretching across the whole screen. Native apps and narrow
// windows are unaffected. The landing page is meant to be wide and doesn't
// use this.
export const appColumnMaxWidth = 640;

export function useAppColumn(): ViewStyle | null {
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web" || width <= appColumnMaxWidth) return null;
  return { width: "100%", maxWidth: appColumnMaxWidth, alignSelf: "center", borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line };
}
