export const colors = {
  ink: "#F2EFE6", muted: "#A39D8E", canvas: "#171717", surface: "#1F1F1F",
  line: "#2E2B24", green: "#D3AF37", greenBright: "#E8CE7A", mint: "#2E2A20",
  lime: "#171310", coral: "#E0724B", darkSurface: "#141414",
};

export const shadow = { shadowColor: "#000000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 18, elevation: 4 };

// The bottom tab bar's own content height (see (tabs)/_layout.tsx). On web it
// renders position: absolute (confirmed via inspecting the rendered DOM), so
// it doesn't reserve layout space for itself - screens need this as their own
// bottom padding there or content renders underneath it. On native the
// navigator already sizes screens to stop above the tab bar, so this constant
// is only meant to be applied on web.
export const tabBarHeight = 82;