export function parseOperationDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const text = String(value).trim();
  if (!text) return null;

  // Formats possibles :
  // 2026-04-20
  // 2026-04-20T10:30:00
  // 20/04/2026
  // 20-04-2026
  // 20/04/2026 10:30
  // 20-04-2026 10:30

  const isoDate = new Date(text);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate;
  }

  const match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    const hour = Number(match[4] ?? 0);
    const minute = Number(match[5] ?? 0);
    const date = new Date(year, month, day, hour, minute);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

export function pickOperationDate(source: any): Date | null {
  if (!source) return null;
  return (
    // InstaDelivery: last_operation_date est le champ exact de l'API
    parseOperationDate(source.last_operation_date) ||
    // Colissimo & autres
    parseOperationDate(source.dateLivraison) ||
    parseOperationDate(source.date_livraison) ||
    parseOperationDate(source.dateEnlevement) ||
    parseOperationDate(source.date_enlevement) ||
    // Champs génériques
    parseOperationDate(source.operationDate) ||
    parseOperationDate(source.dateOperation) ||
    parseOperationDate(source.date_operation) ||
    parseOperationDate(source.eventDate) ||
    parseOperationDate(source.statusDate) ||
    parseOperationDate(source.deliveredDate) ||
    parseOperationDate(source.deliveryDate) ||
    parseOperationDate(source.returnedDate) ||
    parseOperationDate(source.returnDate) ||
    parseOperationDate(source.updatedAt) ||
    parseOperationDate(source.created_at) ||
    parseOperationDate(source.createdAt)
  );
}
