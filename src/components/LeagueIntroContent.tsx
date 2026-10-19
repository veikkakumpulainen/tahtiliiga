import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

// The league's own info text (leagues.info_text), written by an admin.
// Lines starting with ⭐ are headings, *text* is bold and lines starting
// with -, * or • are bullets.

function renderFormattedSpans(text: string, keyPrefix: string) {
  const segments = text.split(/(\*[^*]+\*)/g).filter((segment) => segment.length > 0);
  return segments.map((segment, index) => segment.startsWith("*") && segment.endsWith("*") && segment.length > 1
    ? <Text key={`${keyPrefix}-b-${index}`} style={styles.modalBold}>{segment.slice(1, -1)}</Text>
    : <Text key={`${keyPrefix}-t-${index}`}>{segment}</Text>);
}

export default function LeagueIntroContent({ text }: { text: string }) {
  const nodes: ReactElement[] = [];
  let pendingSpacing = false;
  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) { pendingSpacing = nodes.length > 0; return; }
    const isHeading = /^⭐/.test(line);
    const bulletMatch = !isHeading ? line.match(/^[-*•]\s+(.*)$/) : null;
    const content = isHeading ? line.replace(/^[⭐️\s]+/, "").replace(/[⭐️\s]+$/, "") : bulletMatch ? `• ${bulletMatch[1]}` : line;
    const baseStyle = isHeading ? styles.modalHeading : bulletMatch ? styles.modalBullet : styles.modalText;
    nodes.push(<Text key={index} style={[baseStyle, pendingSpacing && styles.modalParagraphSpacing]}>{renderFormattedSpans(content, String(index))}</Text>);
    pendingSpacing = false;
  });
  return <View>{nodes}</View>;
}

const styles = StyleSheet.create({
  modalHeading: { color: colors.green, fontSize: 14, fontWeight: "900", marginBottom: 8 },
  modalText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  modalBullet: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 4 },
  modalBold: { fontWeight: "900" },
  modalParagraphSpacing: { marginTop: 10 },
});
