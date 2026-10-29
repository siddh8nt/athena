import Link from "next/link";
import { ThemeToggle } from "@/components/SideNav";

// The shared plan's frame: it stays put while the page's shape hands over to the plan, so only the plan moves.
export default function ShareFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="share-main">
      <div className="share-top">
        <Link href="/" className="wordmark-link">
          <strong>Athena</strong>
        </Link>
        <ThemeToggle className="theme-top" />
      </div>
      {children}
    </main>
  );
}
