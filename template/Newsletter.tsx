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
import data from "./issue.json";
import { kestrel } from "./theme";

type Issue = typeof data;

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

export default function Newsletter({
  issue = data,
  assetBase = "https://hyper-elements-round-trip.vercel.app",
}: {
  issue?: Issue;
  assetBase?: string;
}) {
  // Our own art ships with the site; a marketer can also paste any https image.
  const art = (file: string) => ({
    src: /^https?:\/\//.test(file) ? file : `${assetBase}/${file}`,
    width: 960,
    height: 720,
  });

  return (
    <Email width={600} lang="en" theme={kestrel} previewText={issue.preview} title={issue.hero.title}>
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
            <IssueStamp issue={issue.issue} date={issue.date} />
          </Column>
        </Row>
      </Section>

      {/* Cover: words over art. A Layer has no builder tool, so it stays code-owned. */}
      <Layer>
        <Image src={{ src: `${assetBase}/art/cover.png`, width: 1200, height: 560 }} alt="" />
        <Column style={{ padding: [36, 32], alignItems: "end" }}>
          <Heading level={2} style={{ fontSize: 64, color: "#fbf8f2", textAlign: "right", letterSpacing: -2 }}>
            {issue.issue}
          </Heading>
        </Column>
      </Layer>

      {/* Hero copy: every string here comes from issue.json */}
      <Column style={{ padding: [40, 36, 8], gap: 18, backgroundColor: token("colors.paper") }}>
        <Text style={{ apply: ["kicker"] }}>{issue.hero.kicker}</Text>
        <Heading level={1}>{issue.hero.title}</Heading>
        <Text style={{ color: token("colors.muted"), fontSize: 17 }}>{issue.hero.intro}</Text>
        <Button href={issue.hero.cta.href}>{issue.hero.cta.label}</Button>
      </Column>

      <Column style={{ padding: [36, 36, 12], backgroundColor: token("colors.paper"), gap: 10 }}>
        <Divider style={{ borderTop: { width: 1, style: "solid", color: token("colors.border") } }} />
        <Text style={{ apply: ["kicker"], color: token("colors.blue") }}>Shipped this month</Text>
      </Column>

      {/* One row per feature; the art swaps sides on every other row */}
      {issue.features.map((feature, i) => {
        const picture = (
          <Column key="art" style={{ width: 220 }}>
            <Image src={art(feature.image)} alt={feature.title} style={{ width: 220, borderRadius: 14 }} />
          </Column>
        );
        const words = (
          <Column key="words" style={{ gap: 8 }}>
            <Text style={{ apply: ["kicker"], color: i % 2 ? token("colors.blue") : token("colors.primary") }}>
              {`${String(i + 1).padStart(2, "0")} · ${feature.tag}`}
            </Text>
            <Heading level={2} style={{ fontSize: 24, lineHeight: 1.2 }}>
              {feature.title}
            </Heading>
            <Text style={{ fontSize: 15 }}>{feature.body}</Text>
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
          {issue.stats.map((stat) => (
            <Column key={stat.label} style={{ gap: 2, alignItems: "center" }}>
              <Heading level={2} style={{ fontSize: 40, textAlign: "center" }}>
                {stat.value}
              </Heading>
              <Text style={{ fontSize: 13, textAlign: "center" }}>{stat.label}</Text>
            </Column>
          ))}
        </Grid>
      </Section>

      {/* Customer quote */}
      <Row style={{ padding: [32, 28], backgroundColor: token("colors.background") }}>
        <Column style={{ apply: ["card"], border: { width: 1, style: "solid", color: token("colors.border") } }}>
          <Text style={{ fontFamily: token("fonts.heading"), fontSize: 22, lineHeight: 1.4, fontStyle: "italic" }}>
            “{issue.quote.text}”
          </Text>
          <Text style={{ fontSize: 14, color: token("colors.muted") }}>
            <Span style={{ fontWeight: 700, color: token("colors.ink") }}>{issue.quote.author}</Span>, {issue.quote.role}
          </Text>
        </Column>
      </Row>

      {/* Roadmap */}
      <Column style={{ padding: [12, 36, 32], gap: 12, backgroundColor: token("colors.background") }}>
        <Heading level={2}>On the runway</Heading>
        <List type="number" style={{ gap: 8 }}>
          {issue.roadmap.map((item) => (
            <ListItem key={item}>{item}</ListItem>
          ))}
        </List>
      </Column>

      {/* Closing call to action */}
      <Column style={{ padding: [40, 36], gap: 18, alignItems: "center", backgroundColor: token("colors.paper") }}>
        <Heading level={2} style={{ textAlign: "center" }}>
          {issue.cta.title}
        </Heading>
        <Button href={issue.cta.href}>{issue.cta.label}</Button>
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
  );
}
