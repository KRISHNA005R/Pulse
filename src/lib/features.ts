// Features that are built but switched off for now. Flip to true to bring one back.

/**
 * Insurance tracker (You → Insurance): policies, auto-debit premiums, keep-aside in safe-to-spend.
 * While this is off nothing about insurance shows anywhere and saved policies have no effect.
 */
export const INSURANCE_ON = false;

/**
 * Scan a receipt. The photo reading isn't real yet (it returns a sample bill), so the button is
 * hidden until it is. Turn this on only when ReceiptScanner reads the actual photo.
 */
export const RECEIPT_SCAN_ON = false;
