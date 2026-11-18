import Link from "next/link";
import { Hero } from "@/components/landing/Hero";
import { Manifesto } from "@/components/landing/Manifesto";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Plates } from "@/components/landing/Plates";
import { Apis } from "@/components/landing/Apis";
import { ASSET_TOKEN, landingData } from "@/lib/landing-data";
import styles from "@/components/landing/landing.module.css";

export default async function Home() {
  const data = await landingData();
  return (
    <main className={styles.page}>
      <Hero blocks={data.blocks} bound={data.bound} />
      <Manifesto />
      <HowItWorks />
      <Plates html={data.html} owned={data.owned} token={ASSET_TOKEN} />
      <Apis />
      <section className={styles.finale}>
        <p className={styles.sectionKicker}>Your turn</p>
        <h2 className={styles.finaleTitle}>
          <span data-tone="blue">Edit it</span> <span data-tone="orange">anywhere.</span>
        </h2>
        <p>Change a headline in the builder. Change a loop in the code. Watch both sides agree.</p>
        <Link href="/studio" prefetch={false} className={styles.bigButton}>
          <span>Open the studio</span>
          <b aria-hidden>→</b>
        </Link>
      </section>
      <footer className={styles.footer}>
        <span>
          Round Trip · a template for the Hyper Elements Template Challenge · MIT licensed
        </span>
        <span>
          Built with{" "}
          <a href="https://hyperelements.dev" target="_blank" rel="noreferrer">
            Hyper Elements
          </a>{" "}
          and{" "}
          <a href="https://unlayer.com" target="_blank" rel="noreferrer">
            Unlayer
          </a>
        </span>
      </footer>
    </main>
  );
}
