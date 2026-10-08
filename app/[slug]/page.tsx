import { notFound } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { DEMO_BRANDS, demoBySlug } from "@/lib/playbook/demo";

export function generateStaticParams() {
  return DEMO_BRANDS.map((b) => ({ slug: b.slug }));
}

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!demoBySlug(slug)) notFound();
  return <Workspace slug={slug} brands={DEMO_BRANDS.map(({ slug, name, blurb }) => ({ slug, name, blurb }))} />;
}
