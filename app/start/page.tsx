import { redirect } from "next/navigation";

// The old way in: the sample brands now sit on the first screen of onboarding, so /start goes straight there.
export default function Start() {
  redirect("/plan?new=1");
}
