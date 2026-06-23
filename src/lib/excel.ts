import * as XLSX from "xlsx";

/**
 * 解析 Excel 文件为 Tab 分隔文本，便于复用现有粘贴导入逻辑。
 * 自动跳过空行，保留单元格原始值。
 */
export async function parseExcelToText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return "";
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false });
  return rows
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => row.map((cell) => String(cell ?? "").trim()).join("\t"))
    .join("\n");
}

/**
 * 生成并下载 Excel 导入模板（含表头与示例行）。
 */
export function downloadExcelTemplate(filename: string, headers: string[], exampleRows: string[][] = []): void {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "导入模板");
  XLSX.writeFile(workbook, filename);
}
