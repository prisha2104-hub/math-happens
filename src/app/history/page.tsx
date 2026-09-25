import type { Metadata } from "next";
import { HistoryPage } from "@/components/history/HistoryPage";

export const metadata: Metadata = { title: "History · Math Happens" };

export default function Page() {
  return <HistoryPage />;
}
