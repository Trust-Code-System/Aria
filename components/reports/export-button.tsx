"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opens the server-rendered, print-ready HTML in a new tab and triggers the
 * browser's native print dialog so the user can "Save as PDF". Dependency-free
 * and reliable across platforms.
 */
export function ExportButton({ reportId }: { reportId: string }) {
  const exportPdf = () => {
    const w = window.open(`/api/reports/${reportId}/export`, "_blank");
    if (w) {
      w.addEventListener("load", () => setTimeout(() => w.print(), 400));
    }
  };
  return (
    <Button onClick={exportPdf}>
      <FileDown className="h-4 w-4" /> Export PDF
    </Button>
  );
}
