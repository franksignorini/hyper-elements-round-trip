import { defineTheme } from "@hyper-elements/react";

// The Kestrel brand, written once. Every block in Newsletter.tsx inherits it,
// and toDesign() carries these values into the builder as each tool's defaults.
export const kestrel = defineTheme({
  colors: {
    background: "#efe9dd",
    foreground: "#1d1b17",
    paper: "#fbf8f2",
    ink: "#1d1b17",
    muted: "#6f685c",
    // Burnt orange: 4.5:1 on paper and under white button text (the art keeps the bright #ff5a2c).
    primary: "#c2410c",
    primaryForeground: "#ffffff",
    blue: "#2b45ff",
    border: "#d9d1c1",
  },
  fonts: {
    body: "Helvetica, Arial, sans-serif",
    heading: "Georgia, 'Times New Roman', serif",
  },
  fontSizes: { body: 16 },
  lineHeights: { body: 1.6 },
  elements: {
    Heading: {
      fontWeight: 400,
      letterSpacing: -0.5,
      by: {
        level: {
          1: { fontSize: 44, lineHeight: 1.08, mobile: { fontSize: 34 } },
          2: { fontSize: 28, lineHeight: 1.15, mobile: { fontSize: 24 } },
          3: { fontSize: 22, lineHeight: 1.2 },
        },
      },
    },
    Button: {
      borderRadius: 999,
      padding: [14, 28],
      fontWeight: 700,
      letterSpacing: 0.4,
      hover: { backgroundColor: "#1d1b17" },
    },
  },
  styles: {
    kicker: {
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 2,
      textTransform: "uppercase",
      color: "#c2410c",
    },
    card: { backgroundColor: "#fbf8f2", padding: 32, gap: 14, borderRadius: 18 },
  },
});
