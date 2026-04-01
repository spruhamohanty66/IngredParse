import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { createElement } from "react";
import { AnalysisResult } from "./types";
import AnalysisReport from "@/components/results/AnalysisReport";

function sanitizeName(name: string | null | undefined): string {
  return (name ?? "UnknownProduct")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 50);
}

export async function downloadAnalysisPDF(result: AnalysisResult): Promise<void> {
  const productName = result.metadata.product_info.probable_product_name;
  const fileName = `ingredparse_${sanitizeName(productName)}.pdf`;
  const blob = await pdf(createElement(AnalysisReport, { result })).toBlob();
  saveAs(blob, fileName);
}
