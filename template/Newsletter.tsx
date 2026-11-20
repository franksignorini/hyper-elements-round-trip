import {
  Button,
  Column,
  defineElement,
  Divider,
  Email,
  Grid,
  Heading,
  Image,
  Layer,
  Link,
  List,
  ListItem,
  Menu,
  prop,
  Row,
  Section,
  Social,
  Span,
  Text,
  token,
} from "@hyper-elements/react";
import { field, template } from "@hyper-elements/react/template";
import issue from "./issue.values.json";
import { ASSETS, kestrel } from "./theme";

// Engineer-owned: a small stamp built from primitives. The builder has no
// tool for it, so toDesign() hands it over as a locked HTML block.
const IssueStamp = defineElement({
  type: "kestrel.IssueStamp",
  label: "Issue stamp",
  props: {
    issue: prop.text({ label: "Issue" }),
    date: prop.text({ label: "Date" }),
  },
  render: ({ issue, date }) => (
    <Column style={{ border: "1.5px solid #fbf8f2", borderRadius: 999, padding: [5, 12] }}>
      <Text style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "#fbf8f2", textAlign: "center" }}>
        {`${issue} · ${date}`.toUpperCase()}
      </Text>
    </Column>
  ),
});

// The copy a marketer owns: each field typed, labelled and guided. Everything
// else in this file is fixed. Builder edits land in issue.values.json, and an
// edit this template refuses (a headline over 48 characters) is held back.
const text = (label: string, guidance?: string, maxLength?: number) =>
  prop.text({ label, guidance, maxLength, required: true });
const link = (label: string) => prop.link({ label, required: true });
const cta = (label: string) => prop.object({ label: text("Button label", "A verb first.", 28), href: link("Button link") }, { label, required: true });

const fields = {
  preview: text("Preview text", "Shown after the subject line in the inbox. Finish the subject's thought.", 140),
  issue: text("Issue number", "As printed on the cover: No. 14.", 12),
  date: text("Issue date", "Month and year.", 24),
  hero: prop.object(
    {
      kicker: text("Kicker", "The newsletter's name, or a section name.", 32),
      title: text("Headline", "What changed for the reader, in under 48 characters.", 48),
      intro: text("Intro", "Two sentences: what shipped, and what's below.", 260),
      cta: cta("Hero button"),
    },
    { label: "Hero", required: true },
  ),
  features: prop.list(
    prop.object(
      {
        tag: text("Tag", "New, Improved or Beta.", 12),
        title: text("Feature name", undefined, 32),
        body: text("Description", "One or two sentences about the reader's gain.", 220),
        image: field.image({ label: "Art", fit: "cover", aspect: { min: 1.2, max: 1.5 }, minWidth: 440, required: true }),
        link: prop.object({ label: text("Link text", "Says where it goes.", 48), href: link("Link") }, { label: "Read more", required: true }),
      },
      { label: "Feature" },
    ),
    { label: "Features", min: 1, max: 4 },
  ),
  stats: prop.list(
    prop.object({ value: text("Number", "Short: 3.2M, -61%, 48s.", 6), label: text("What it counts", undefined, 24) }, { label: "Stat" }),
    { label: "In numbers", min: 3, max: 3 },
  ),
  quote: prop.object(
    {
      text: text("Quote", "A customer's own words, without the quote marks.", 200),
      author: text("Name"),
      role: text("Role and company"),
    },
    { label: "Customer quote", required: true },
  ),
  roadmap: prop.list(text("Item", "What lands next, in plain words.", 72), { label: "Roadmap", min: 1, max: 5 }),
  cta: prop.object(
    { title: text("Closing headline", undefined, 48), label: text("Button label", "A verb first.", 28), href: link("Button link") },
    { label: "Closing call to action", required: true },
  ),
};

// A path under ASSETS, or a URL as given.
const art = (image: { src: string; width: number; height: number }) => ({
  ...image,
  src: /^https?:\/\//.test(image.src) ? image.src : `${ASSETS}/${image.src}`,
});

export default template({
  id: "kestrel.Newsletter",
  version: "1.0.0",
  label: "Kestrel Dispatch",
  description: "A monthly product newsletter: a cover, what shipped, three numbers, a quote and the roadmap.",
  guidance: "Write for a customer who skims: every headline says what changed for them.",
  root: "Email",
  fields,
  example: issue.values,
  render: (v) => (
    <Email width={600} lang="en" theme={kestrel} previewText={v.preview} title={v.hero.title}>
      {/* Masthead: wordmark and a locked stamp */}
      <Section tokens={{ colors: { background: "#1d1b17", foreground: "#fbf8f2" } }} style={{ padding: [18, 28] }}>
        <Row style={{ alignItems: "center" }} stackOnMobile={false}>
          <Text
            style={{
              fontFamily: token("fonts.heading"),
              fontSize: 22,
              letterSpacing: 3,
              fontWeight: 700,
              mobile: { fontSize: 17, letterSpacing: 1 },
            }}
          >
            KESTREL<Span style={{ color: "#ff5a2c" }}>.</Span>
          </Text>
          <Column style={{ width: 210, alignItems: "end", mobile: { width: 180 } }}>
            <IssueStamp issue={v.issue} date={v.date} />
          </Column>
        </Row>
      </Section>

      {/* Cover: words over art. A Layer has no builder tool, so it stays code-owned. */}
      <Layer>
        <Image src={{ src: `${ASSETS}/art/cover.png`, width: 1200, height: 560 }} alt="" />
        <Column style={{ padding: [36, 32], alignItems: "end" }}>
          <Heading level={2} style={{ fontSize: 64, color: "#fbf8f2", textAlign: "right", letterSpacing: -2 }}>
            {v.issue}
          </Heading>
        </Column>
      </Layer>

      {/* Hero copy: every string here is a field */}
      <Column style={{ padding: [40, 36, 8], gap: 18, backgroundColor: token("colors.paper") }}>
        <Text field="hero.kicker" style={{ apply: ["kicker"] }}>{v.hero.kicker}</Text>
        <Heading field="hero.title" level={1}>{v.hero.title}</Heading>
        <Text field="hero.intro" style={{ color: token("colors.muted"), fontSize: 17 }}>{v.hero.intro}</Text>
        <Button field="hero.cta" href={v.hero.cta.href}>{v.hero.cta.label}</Button>
      </Column>

      <Column style={{ padding: [36, 36, 12], backgroundColor: token("colors.paper"), gap: 10 }}>
        <Divider style={{ borderTop: { width: 1, style: "solid", color: token("colors.border") } }} />
        <Text style={{ apply: ["kicker"], color: token("colors.blue") }}>Shipped this month</Text>
      </Column>

      {/* One row per feature; the art swaps sides on every other row */}
      {v.features.map((feature, i) => {
        const picture = (
          <Column key="art" style={{ width: 220 }}>
            <Image field={`features[${i}].image`} src={art(feature.image)} alt={feature.title} style={{ width: 220, borderRadius: 14 }} />
          </Column>
        );
        const words = (
          <Column key="words" style={{ gap: 8 }}>
            <Text style={{ apply: ["kicker"], color: i % 2 ? token("colors.blue") : token("colors.primary") }}>
              {`${String(i + 1).padStart(2, "0")} · ${feature.tag}`}
            </Text>
            <Heading field={`features[${i}].title`} level={2} style={{ fontSize: 24, lineHeight: 1.2 }}>
              {feature.title}
            </Heading>
            <Text field={`features[${i}].body`} style={{ fontSize: 15 }}>{feature.body}</Text>
            <Text style={{ fontSize: 15, fontWeight: 700 }}>
              <Link href={feature.link.href} style={{ color: token("colors.ink") }}>
                {feature.link.label} →
              </Link>
            </Text>
          </Column>
        );
        return (
          <Row
            key={feature.title}
            style={{ padding: [20, 36], gap: 24, alignItems: "center", backgroundColor: token("colors.paper") }}
          >
            {i % 2 === 0 ? [picture, words] : [words, picture]}
          </Row>
        );
      })}

      {/* Numbers band, inverted */}
      <Section
        tokens={{ colors: { background: "#2b45ff", foreground: "#fbf8f2" } }}
        style={{ padding: [36, 28], gap: 6 }}
      >
        <Text style={{ apply: ["kicker"], color: "#fbf8f2", textAlign: "center" }}>November in numbers</Text>
        <Grid columns={3} style={{ gap: 12 }}>
          {v.stats.map((stat, i) => (
            <Column key={stat.label} style={{ gap: 2, alignItems: "center" }}>
              <Heading field={`stats[${i}].value`} level={2} style={{ fontSize: 40, textAlign: "center" }}>
                {stat.value}
              </Heading>
              <Text field={`stats[${i}].label`} style={{ fontSize: 13, textAlign: "center" }}>{stat.label}</Text>
            </Column>
          ))}
        </Grid>
      </Section>

      {/* Customer quote */}
      <Row style={{ padding: [32, 28], backgroundColor: token("colors.background") }}>
        <Column style={{ apply: ["card"], border: { width: 1, style: "solid", color: token("colors.border") } }}>
          <Text style={{ fontFamily: token("fonts.heading"), fontSize: 22, lineHeight: 1.4, fontStyle: "italic" }}>
            “{v.quote.text}”
          </Text>
          <Text style={{ fontSize: 14, color: token("colors.muted") }}>
            <Span style={{ fontWeight: 700, color: token("colors.ink") }}>{v.quote.author}</Span>, {v.quote.role}
          </Text>
        </Column>
      </Row>

      {/* Roadmap */}
      <Column style={{ padding: [12, 36, 32], gap: 12, backgroundColor: token("colors.background") }}>
        <Heading level={2}>On the runway</Heading>
        <List type="number" style={{ gap: 8 }}>
          {v.roadmap.map((item) => (
            <ListItem key={item}>{item}</ListItem>
          ))}
        </List>
      </Column>

      {/* Closing call to action */}
      <Column style={{ padding: [40, 36], gap: 18, alignItems: "center", backgroundColor: token("colors.paper") }}>
        <Heading field="cta.title" level={2} style={{ textAlign: "center" }}>
          {v.cta.title}
        </Heading>
        <Button field="cta" href={v.cta.href}>{v.cta.label}</Button>
      </Column>

      <Section style={{ padding: [28, 28, 40], gap: 14 }}>
        <Social
          iconType="circle"
          size={28}
          style={{ justifyContent: "center", gap: 8 }}
          icons={[
            { name: "linkedin", href: "https://kestrel.example/linkedin" },
            { name: "github", href: "https://kestrel.example/github" },
            { name: "youtube", href: "https://kestrel.example/youtube" },
          ]}
        />
        <Menu
          style={{ justifyContent: "center", fontSize: 13, color: token("colors.muted") }}
          separator="·"
          items={[
            { text: "Changelog", href: "https://kestrel.example/changelog" },
            { text: "Docs", href: "https://kestrel.example/docs" },
            { text: "Status", href: "https://kestrel.example/status" },
          ]}
        />
        <Text style={{ fontSize: 12, color: token("colors.muted"), textAlign: "center" }}>
          Kestrel Analytics, 18 Wharf Road, London N1 7GR. You get this because you use Kestrel.
        </Text>
      </Section>
    </Email>
  ),
});
