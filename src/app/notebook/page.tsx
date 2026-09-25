import type { Metadata } from "next";
import { NotebookPage } from "@/components/notebook/NotebookPage";

export const metadata: Metadata = { title: "Mistake notebook · Math Happens" };

export default function Page() {
  return <NotebookPage />;
}
