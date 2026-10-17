/**
 * Format ISO date string or YYYY-MM-DD to DD-MM-YYYY format for UI display.
 * Avoids timezone conversions to prevent date shifting.
 * 
 * @param {string} date - ISO timestamp string or YYYY-MM-DD date string
 * @returns {string} Formatted date (DD-MM-YYYY) or '-' if invalid/empty
 */
export const formatDate = (date) => {
  if (!date) return '-';

  const str = String(date);
  const parts = str.slice(0, 10).split('-');
  if (parts.length !== 3) return date;

  const [year, month, day] = parts;
  if (!year || !month || !day) return date;

  return `${day}-${month}-${year}`;
};
