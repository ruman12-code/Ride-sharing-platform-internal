import ExcelJS from "exceljs";
import type { Sheet } from "./excel.js";

/**
 * Turns the plain sheet data from `buildWorkbook` into an .xlsx.
 *
 * Deliberately thin: all content decisions live in `excel.ts`, which is testable
 * without a binary, so changing the writer can never change what is reported.
 */
export const writeWorkbook = async (sheets: readonly Sheet[]): Promise<ArrayBuffer> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Office Carpool";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width,
    }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F3EE" },
    };
    for (const row of sheet.rows) ws.addRow(row);
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
};
