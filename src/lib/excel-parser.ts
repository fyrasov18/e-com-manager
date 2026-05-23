import * as XLSX from "xlsx";

export type ParseResult = {
  success: boolean;
  sheets?: string[];
  columns?: string[];
  rows?: Record<string, unknown>[];
  error?: string;
};

export async function parseExcelBuffer(buffer: Buffer): Promise<ParseResult> {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

    if (!workbook.SheetNames.length) {
      return { success: false, error: "Aucune feuille trouvée dans le fichier." };
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    if (!worksheet) {
      return { success: false, error: "Feuille non lisible." };
    }

    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, unknown>[];

    if (!jsonData.length) {
      return { success: false, error: "Aucune donnée trouvée dans le fichier." };
    }

    const columns = Object.keys(jsonData[0]);

    return {
      success: true,
      sheets: workbook.SheetNames,
      columns,
      rows: jsonData,
    };
  } catch (err) {
    console.error("[Excel Parser] Error:", err);
    return { success: false, error: "Erreur lors du parsing Excel." };
  }
}