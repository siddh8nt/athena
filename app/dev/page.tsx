import { notFound } from "next/navigation";
import { DevMap } from "./DevMap";

// Developer mode's step map (dev server only; 404 in production).
export default function DevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevMap />;
}
