import styles from "./landing.module.css";

const APIS = [
  ["toDesign()", "@hyper-elements/react/builder", "JSX → Unlayer design JSON, plus the report that marks the locked zones.", "src/lib/rt/engine.ts"],
  ["fromDesign()", "@hyper-elements/react/builder", "The builder's design back as JSX. Shown raw in the studio as ground truth.", "src/lib/rt/engine.ts"],
  ["render()", "@hyper-elements/react", "The email HTML and plain text, re-rendered in the browser after every trip.", "src/lib/rt/checks.ts"],
  ["validate()", "@hyper-elements/react", "Template checks, in the browser and on the server, with the emailClients() plugin.", "src/app/api/clients/route.ts"],
  ["renderInEmailClients()", "@hyper-elements/email-clients", "Nine client previews, from classic Outlook to the Gmail app, drawn locally.", "src/app/api/clients/route.ts"],
  ["defineTheme()", "@hyper-elements/react", "The Kestrel brand, written once: colors, type scale, button and kicker styles.", "template/theme.ts"],
  ["defineElement()", "@hyper-elements/react", "IssueStamp, a custom element the builder can't edit: a deliberate locked zone.", "template/Newsletter.tsx"],
  ["Canvas + renderImage()", "@hyper-elements/react/image", "Every illustration in the newsletter is drawn by Hyper Elements itself. No stock art.", "scripts/art.tsx"],
  ["hyper-elements check", "@hyper-elements/cli", "The same checks from the shell, for CI: npm run check.", "package.json"],
];

export function Apis() {
  return (
    <section id="apis" className={styles.apis}>
      <div className={styles.apisHead}>
        <p className={styles.sectionKicker}>Job ticket</p>
        <h2>
          Nine pieces of <em data-tone="blue">Hyper Elements</em>, one press run.
        </h2>
        <p>
          Round Trip uses the whole builder package, both directions, and leans on the rest of the library to prove each
          trip is safe to ship.
        </p>
      </div>
      <ol className={styles.ticket}>
        {APIS.map(([name, pkg, what, where], i) => (
          <li key={name} style={{ ["--d" as string]: `${i * 60}ms` }}>
            <span className={styles.ticketNo}>{String(i + 1).padStart(2, "0")}</span>
            <code className={styles.ticketName}>{name}</code>
            <span className={styles.ticketWhat}>{what}</span>
            <span className={styles.ticketWhere}>
              <span>{pkg}</span>
              <span>{where}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
