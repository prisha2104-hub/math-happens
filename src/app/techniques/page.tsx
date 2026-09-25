import type { Metadata } from "next";
import { TechniquesPage } from "@/components/techniques/TechniquesPage";

export const metadata: Metadata = { title: "Techniques · Math Happens" };

export default function Page() {
  return <TechniquesPage />;
}
