/**
 * BellePoule Modern - Préload : boîte d'impression intégrée enregistrée par le renderer (#1214, #1774)
 * Licensed under GPL-3.0
 */
export type PrintRequestHandler = (html: string) => Promise<{ success: boolean; error?: string }>;

let printRequestHandler: PrintRequestHandler | null = null;

export function getPrintRequestHandler(): PrintRequestHandler | null {
  return printRequestHandler;
}

export function setPrintRequestHandler(handler: PrintRequestHandler | null): void {
  printRequestHandler = typeof handler === 'function' ? handler : null;
}
