/* ============================================================
   GYMBOT QC — OWNER: RECEIPT DOWNLOAD (Phase 10)
   "Download a simple receipt placeholder" per the brief — this
   is intentionally a plain-text file built client-side, not a
   PDF. There's no document-generation backend in this app, and
   a fake-looking PDF would be a worse "honesty" tradeoff than a
   plain receipt.txt that says exactly what it is. Same pattern
   as csv-service.js's client-side Blob download.
   ============================================================ */

export function downloadInvoiceReceipt(invoice){
  const lines = [
    "GymBot QC — Payment Receipt",
    "============================",
    `Invoice: ${invoice.id}`,
    `Plan: ${invoice.planName}`,
    `Amount: PHP ${invoice.amount.toLocaleString()}`,
    `Status: ${invoice.status}`,
    `Payment method: ${invoice.paymentMethod ? invoice.paymentMethod.toUpperCase() : "\u2014"}`,
    `Billing period: ${formatDate(invoice.billingPeriodStart)} \u2013 ${formatDate(invoice.billingPeriodEnd)}`,
    `Invoice created: ${formatDate(invoice.createdAt)}`,
    `Paid on: ${formatDate(invoice.paidDate)}`,
    "",
    "This is a system-generated receipt placeholder — not an official",
    "BIR sales invoice/OR. Contact GymBot QC support if you need one."
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${invoice.id}-receipt.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDate(iso){
  if(!iso) return "\u2014";
  try{ return new Date(iso).toLocaleDateString(); }catch(err){ return "\u2014"; }
}
