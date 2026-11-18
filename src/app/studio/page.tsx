import type { Metadata } from "next";
import { StudioLoader } from "./StudioLoader";

export const metadata: Metadata = {
  title: "Studio · Round Trip",
  description: "Edit the Kestrel newsletter in JSX or in Unlayer's builder, and watch every edit travel both ways.",
};

export default function StudioPage() {
  return <StudioLoader />;
}
