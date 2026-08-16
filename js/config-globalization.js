/* ============================================================
   GYMBOT QC — GLOBALIZATION CONFIG (Phase 14, Global OS Sec. 52)
   Pure configuration data. Defines the currencies/languages/
   countries a gym CAN be configured with — this is the seam a
   future "read a gym's currency instead of hardcoding ₱" refactor
   plugs into.

   HONESTY NOTE: adding this file does not, by itself, make the
   app multi-currency or multi-language. Every ₱/PHP.format(...)
   call already in admin-billing-page-ui.js, admin-overview-page-ui.js,
   owner-*-ui.js, etc. still hardcodes PHP and English today. That
   refactor (reading formatCurrency(amount, gym.currencyCode) and a
   real i18n string table everywhere currency/copy is rendered) is
   real, substantial UI work across dozens of files — listed as
   remaining work, not silently done here.
   ============================================================ */

export const SUPPORTED_CURRENCIES = Object.freeze([
  { code: "PHP", label: "Philippine Peso", symbol: "₱" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "AED", label: "UAE Dirham", symbol: "AED" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$" }
]);

export const SUPPORTED_LANGUAGES = Object.freeze([
  { code: "en", label: "English" },
  { code: "fil", label: "Filipino" },
  { code: "ja", label: "Japanese" },
  { code: "ar", label: "Arabic" }
]);

export const SUPPORTED_COUNTRIES = Object.freeze([
  { code: "PH", label: "Philippines", defaultCurrency: "PHP", defaultLanguage: "fil" },
  { code: "US", label: "United States", defaultCurrency: "USD", defaultLanguage: "en" },
  { code: "GB", label: "United Kingdom", defaultCurrency: "GBP", defaultLanguage: "en" },
  { code: "JP", label: "Japan", defaultCurrency: "JPY", defaultLanguage: "ja" },
  { code: "AE", label: "United Arab Emirates", defaultCurrency: "AED", defaultLanguage: "ar" }
]);

export const DEFAULT_COUNTRY_CODE = "PH"; // matches every existing gym record's implicit assumption today

export function getCurrency(code){
  return SUPPORTED_CURRENCIES.find(c => c.code === code) || SUPPORTED_CURRENCIES[0];
}

export function getCountry(code){
  return SUPPORTED_COUNTRIES.find(c => c.code === code) || SUPPORTED_COUNTRIES.find(c => c.code === DEFAULT_COUNTRY_CODE);
}

/** Formats an amount using a currency CODE (not a hardcoded PHP
 *  Intl.NumberFormat instance). Existing screens haven't switched to
 *  this yet — see file header. */
export function formatCurrencyAmount(amount, currencyCode){
  const currency = getCurrency(currencyCode);
  try{
    return new Intl.NumberFormat("en", { style: "currency", currency: currency.code, maximumFractionDigits: 0 }).format(amount);
  }catch(err){
    // Unsupported Intl currency code — fall back to symbol + plain number
    // rather than letting a bad config value crash a render.
    return `${currency.symbol}${Math.round(amount).toLocaleString()}`;
  }
}
