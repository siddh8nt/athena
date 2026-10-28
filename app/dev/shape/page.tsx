import { notFound } from "next/navigation";
import { JourneyShape } from "@/components/JourneyPage";

// The shape /plan shows while the journey loads (PRD §23.7 e), held still so it can be looked at (dev server only).
export default function ShapePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <JourneyShape />;
}
