// A second, unrelated template, to show Round Trip isn't tied to the newsletter:
//   npm run push -- examples/welcome/welcome.values.json
//   npm run pull -- out/welcome.design.json examples/welcome/welcome.values.json
import { Button, Column, defineTheme, Email, Heading, prop, Section, Text, token } from "@hyper-elements/react";
import { template } from "@hyper-elements/react/template";
import values from "./welcome.values.json";

const theme = defineTheme({
  colors: { background: "#e3e8f2", foreground: "#1d1b17", paper: "#f1f4fa", muted: "#5a6274", primary: "#2b45ff", primaryForeground: "#ffffff" },
  fonts: { body: "Helvetica, Arial, sans-serif", heading: "Georgia, 'Times New Roman', serif" },
  fontSizes: { body: 16 },
  lineHeights: { body: 1.55 },
  elements: { Button: { borderRadius: 999, padding: [13, 26], fontWeight: 700 } },
});

const text = (label: string, guidance?: string, maxLength?: number) => prop.text({ label, guidance, maxLength, required: true });

export default template({
  id: "examples.Welcome",
  version: "1.0.0",
  label: "Welcome email",
  description: "The first email after sign-up: a greeting, three first steps, one button.",
  root: "Email",
  fields: {
    preview: text("Preview text", "The line after the subject in the inbox.", 120),
    headline: text("Headline", "Say what they can do now, not that they signed up.", 40),
    intro: text("Intro", "Two sentences at most.", 200),
    steps: prop.list(prop.object({ title: text("Step", undefined, 40), body: text("What it does", undefined, 140) }, { label: "Step" }), {
      label: "First steps",
      min: 3,
      max: 3,
    }),
    cta: prop.object({ label: text("Button label", "A verb first.", 24), href: prop.link({ label: "Button link", required: true }) }, { label: "Button", required: true }),
    signoff: text("Sign-off", "A person's name reads better than a team's.", 60),
  },
  example: values.values,
  render: (v) => (
    <Email width={560} lang="en" theme={theme} previewText={v.preview} title={v.headline}>
      <Section style={{ padding: [40, 32, 8] }}>
        <Heading level={1} style={{ fontSize: 34, lineHeight: 1.15 }}>
          {v.headline}
        </Heading>
        <Text style={{ color: token("colors.muted"), fontSize: 17 }}>{v.intro}</Text>
      </Section>
      <Section style={{ padding: [24, 32] }}>
        <Text style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: token("colors.primary") }}>
          Three things to try first
        </Text>
        {v.steps.map((step, i) => (
          <Column key={step.title} style={{ padding: [14, 18], gap: 4, backgroundColor: token("colors.paper"), borderRadius: 12 }}>
            <Heading level={2} style={{ fontSize: 20 }}>
              {`${i + 1}. ${step.title}`}
            </Heading>
            <Text style={{ fontSize: 15 }}>{step.body}</Text>
          </Column>
        ))}
      </Section>
      <Section style={{ padding: [16, 32, 40], gap: 18 }}>
        <Button href={v.cta.href}>{v.cta.label}</Button>
        <Text style={{ fontSize: 15, color: token("colors.muted") }}>{v.signoff}</Text>
      </Section>
    </Email>
  ),
});
