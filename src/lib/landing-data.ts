// Computed on the server at build time: the committed template, rendered by
// Hyper Elements and traced, for the landing page's live specimens.
import "server-only";
import { render } from "@hyper-elements/react";
import Newsletter from "@template/Newsletter";
import { TEMPLATE_SOURCES } from "@/generated/sources";
import { build } from "@/lib/rt/engine";
import { ownership, type Owner } from "@/lib/rt/ownership";
import type { TemplateComponent } from "@/lib/rt/compile";

/** Stands in for the site's origin; the page swaps it for location.origin. */
export const ASSET_TOKEN = "https://assets.round-trip.invalid";

export interface OwnedBlock {
  id: string;
  type: string;
  owner: Owner;
  label: string;
  text: string;
  src: string;
  paths: string[];
}

export interface LandingData {
  html: string;
  owned: OwnedBlock[];
  report: string[];
  bytes: number;
  blocks: number;
  bound: number;
}

export async function landingData(): Promise<LandingData> {
  const snap = build({ ...TEMPLATE_SOURCES }, ASSET_TOKEN, Newsletter as unknown as TemplateComponent);
  const { html } = await render(snap.element);
  const owned = ownership(snap).map((o) => ({
    id: o.block.id,
    type: o.block.type,
    owner: o.owner,
    label: o.label,
    text: o.block.fields.text ?? "",
    src: o.block.fields.src ?? "",
    paths: o.paths,
  }));
  return {
    html,
    owned,
    report: snap.report,
    bytes: html.length,
    blocks: snap.blocks.length,
    bound: snap.paths.length,
  };
}
