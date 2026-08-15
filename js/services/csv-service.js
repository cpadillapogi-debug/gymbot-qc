/* ============================================================
   GYMBOT QC — EXPORT SERVICE (CSV + JSON)
   Builds and triggers download of lead exports. Phase 5 extends
   this from CSV-only, 6-field rows to every CRM field, plus a
   JSON format and a date-range filter — used by the Leads page's
   Export panel and, indirectly, by the "CSV Export"/"JSON Export"
   entries in Lead Routing (Owner Settings), which are the same
   download under the hood.
   ============================================================ */
import { csvEscape } from "../utils.js";

const CSV_HEADER = [
  "Name", "Phone", "Email", "Fitness Goal", "Preferred Visit Time",
  "Source", "Status", "Notes", "Created At", "Updated At", "Last Activity"
];

function leadToRow(l){
  return [
    l.name, l.phone, l.email, l.goal, l.preferredTime,
    l.source, l.status, l.notes, l.createdAt, l.updatedAt, l.lastActivityAt
  ];
}

export function leadsToCsv(leads){
  const rows = leads.map(l => leadToRow(l).map(csvEscape).join(","));
  return CSV_HEADER.map(csvEscape).join(",") + "\n" + rows.join("\n");
}

/** Full-fidelity export, including status history — CSV can't represent
 *  the history array cleanly, JSON is the format to reach for when that
 *  detail matters (e.g. handing off to another system). */
export function leadsToJson(leads){
  return JSON.stringify(leads, null, 2);
}

function triggerDownload(content, filename, mimeType){
  try{
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }catch(err){
    console.error("[csv-service] export failed", err);
    return false;
  }
}

export function downloadCsv(csvContent, filename){
  return triggerDownload(csvContent, filename, "text/csv;charset=utf-8;");
}

export function downloadJson(jsonContent, filename){
  return triggerDownload(jsonContent, filename, "application/json;charset=utf-8;");
}

export function todaysCsvFilename(prefix = "gymbot-leads"){
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function todaysJsonFilename(prefix = "gymbot-leads"){
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * @param {object[]} leads
 * @param {string} startDate  "YYYY-MM-DD", inclusive
 * @param {string} endDate    "YYYY-MM-DD", inclusive
 * @returns {object[]} leads created within the range
 */
export function filterLeadsByDateRange(leads, startDate, endDate){
  const start = startDate ? new Date(startDate + "T00:00:00").getTime() : -Infinity;
  const end = endDate ? new Date(endDate + "T23:59:59.999").getTime() : Infinity;
  return (leads || []).filter(l => {
    if(!l || !l.createdAt) return false;
    const t = new Date(l.createdAt).getTime();
    return t >= start && t <= end;
  });
}
