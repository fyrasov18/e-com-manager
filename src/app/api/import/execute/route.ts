import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { importExcelOrderRows } from "@/lib/order-import";

type ExcelRow = Record<string, unknown>;
type ColumnMapping = { excelColumn: string; targetField: string };

export async function POST(request: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await request.json();
    const { rows, mappings, target } = body as { rows: ExcelRow[]; mappings: ColumnMapping[]; target: string };

    if (!rows?.length || !mappings?.length) {
      return NextResponse.json({ error: "Aucune donnee a importer." }, { status: 400 });
    }

    let imported = 0;
    let ignored = 0;
    const errors: string[] = [];

    if (target === "products") {
      for (const row of rows) {
        try {
          let name = "";
          let stock = 0;
          let costPrice = 0;
          let salePrice = 0;
          let sku = "";
          let description = "";

          for (const mapping of mappings) {
            const value = row[mapping.excelColumn];
            if (value !== undefined && value !== null && value !== "") {
              const strValue = String(value);
              if (mapping.targetField === "name") {
                name = strValue;
              } else if (mapping.targetField === "stock") {
                stock = parseFloat(strValue) || 0;
              } else if (mapping.targetField === "costPrice") {
                costPrice = parseFloat(strValue) || 0;
              } else if (mapping.targetField === "salePrice") {
                salePrice = parseFloat(strValue) || 0;
              } else if (mapping.targetField === "sku") {
                sku = strValue;
              } else if (mapping.targetField === "description") {
                description = strValue;
              }
            }
          }

          if (!name) {
            ignored++;
            errors.push("Ligne ignoree: nom manquant");
            continue;
          }

          const existing = await prisma.product.findFirst({
            where: { teamId, name },
          });

          if (existing) {
            await prisma.product.update({
              where: { id: existing.id },
              data: {
                stockQuantity: stock || existing.stockQuantity,
                supplierName: description || existing.supplierName,
              },
            });
          } else {
            const skuValue = sku || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            await prisma.product.create({
              data: {
                name,
                sku: skuValue,
                stockQuantity: stock,
                revenue: salePrice,
                margin: salePrice && costPrice ? ((salePrice - costPrice) / salePrice) * 100 : 0,
                supplierName: description || null,
                teamId,
              },
            });
          }
          imported++;
        } catch (err) {
          console.error("[Import] Product error:", err);
          ignored++;
        }
      }
    } else if (target === "orders") {
      const orderImport = await importExcelOrderRows(teamId, rows, mappings);
      imported = orderImport.imported + orderImport.updated;
      ignored = orderImport.skipped + orderImport.failed;
      errors.push(...orderImport.errors);
    } else if (target === "expenses") {
      for (const row of rows) {
        try {
          let name = "";
          let amount = 0;
          let type = "ONE_TIME";
          let frequency: string | null = null;
          let category = "Autre";

          for (const mapping of mappings) {
            const value = row[mapping.excelColumn];
            if (value !== undefined && value !== null && value !== "") {
              const strValue = String(value);
              if (mapping.targetField === "name") {
                name = strValue;
              } else if (mapping.targetField === "amount") {
                amount = parseFloat(strValue) || 0;
              } else if (mapping.targetField === "type") {
                type = strValue.toUpperCase().includes("REC") ? "RECURRING" : "ONE_TIME";
              } else if (mapping.targetField === "frequency") {
                frequency = strValue.toUpperCase().includes("JOUR")
                  ? "DAILY"
                  : strValue.toUpperCase().includes("SEM")
                    ? "WEEKLY"
                    : strValue.toUpperCase().includes("ANN")
                      ? "YEARLY"
                      : "MONTHLY";
              } else if (mapping.targetField === "category") {
                category = strValue;
              }
            }
          }

          if (!name || !amount) {
            ignored++;
            errors.push("Ligne ignoree: nom ou montant manquant");
            continue;
          }

          await prisma.expense.create({
            data: {
              name,
              amount,
              type,
              frequency,
              category,
              teamId,
            },
          });
          imported++;
        } catch (err) {
          console.error("[Import] Expense error:", err);
          ignored++;
        }
      }
    }

    return NextResponse.json({
      imported,
      ignored,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    console.error("[Import] Execute error:", err);
    return NextResponse.json({ error: "Erreur lors de l'import." }, { status: 500 });
  }
}
