/**
 * 通用 PDF 导出按钮
 * 接收一个 element id，把它截图打包成 PDF 下载
 */

"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface Props {
  targetId: string;
  filename?: string;
  label?: string;
  className?: string;
}

export function ExportPDFButton({
  targetId,
  filename = "report.pdf",
  label = "Export PDF",
  className,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    const element = document.getElementById(targetId);
    if (!element) return;

    setBusy(true);
    try {
      // html2canvas-pro 比 html2canvas 支持 oklch 等现代色彩
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas-pro"),
      ]);

      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      // 跨页处理
      if (imgHeight <= pdfHeight) {
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      } else {
        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
      }

      pdf.save(filename);
    } catch (e) {
      console.error("PDF export failed:", e);
      alert("PDF export failed: " + (e instanceof Error ? e.message : "unknown error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className={
        className ||
        "flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
      }
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      {busy ? "Exporting..." : label}
    </button>
  );
}
