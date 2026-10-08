import { Workspace } from "@/components/Workspace";
import { DEMO_BRANDS } from "@/lib/playbook/demo";

// The landing page is the app (§2.2): it opens on the hero brand.
export default function Home() {
  return <Workspace slug={DEMO_BRANDS[0].slug} brands={DEMO_BRANDS.map(({ slug, name, blurb }) => ({ slug, name, blurb }))} />;
}
