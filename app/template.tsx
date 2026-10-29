import { PageTransition } from "@/components/PageTransition";

// A template mounts afresh on every route change (a layout doesn't), so each page leaves and arrives through one
// transition: the landing, the journey and a shared plan alike.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
