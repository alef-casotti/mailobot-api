/**
 * Utilitários para o Motor de Descoberta de Leads
 */

/**
 * Normaliza número de telefone removendo caracteres não numéricos
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

/**
 * Extrai URLs de um texto (ex: bio do Instagram)
 * @param {string} text
 * @returns {string[]}
 */
function extractUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const urlRegex = /https?:\/\/[^\s]+/g;
  return text.match(urlRegex) || [];
}

/**
 * Verifica se o texto contém link do WhatsApp
 * @param {string} text
 * @returns {boolean}
 */
function hasWhatsAppLink(text) {
  if (!text) return false;
  const whatsappPatterns = [
    /wa\.me\//i,
    /whatsapp\.com/i,
    /api\.whatsapp\.com/i,
    /bit\.ly\/.*whatsapp/i,
  ];
  return whatsappPatterns.some((p) => p.test(text));
}

/**
 * Extrai telefone de links WhatsApp (wa.me/5511999999999)
 * @param {string} text
 * @returns {string|null}
 */
function extractPhoneFromWhatsAppLink(text) {
  if (!text) return null;
  const match = text.match(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)(\d{10,15})/i);
  return match ? match[1] : null;
}

/**
 * Extrai handle do Instagram de URL ou texto
 * @param {string} urlOrText
 * @returns {string|null}
 */
function extractInstagramHandle(urlOrText) {
  if (!urlOrText || typeof urlOrText !== 'string') return null;
  const match = urlOrText.match(/(?:instagram\.com\/|@)([a-zA-Z0-9_.]+)/);
  return match ? match[1].replace(/\/$/, '') : null;
}

/**
 * Formata data para ISO string (YYYY-MM-DD)
 * @param {Date|string} date
 * @returns {string}
 */
function formatDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Verifica se uma data está dentro do período (inclusive)
 * @param {Date|string} date
 * @param {Date|string} start
 * @param {Date|string} end
 * @returns {boolean}
 */
function isDateInRange(date, start, end) {
  const d = new Date(date);
  const s = new Date(start);
  const e = new Date(end);
  return d >= s && d <= e;
}

/**
 * Retorna início do dia em UTC
 * @param {Date} date
 * @returns {Date}
 */
function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Retorna fim do dia em UTC
 * @param {Date} date
 * @returns {Date}
 */
function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Parseia número de seguidores (ex: "1.5K" -> 1500, "2.3M" -> 2300000)
 * @param {string} str
 * @returns {number}
 */
function parseFollowersCount(str) {
  if (!str || typeof str !== 'string') return 0;
  const cleaned = str.replace(/[\s,]/g, '').toUpperCase();
  const match = cleaned.match(/^([\d.]+)([KM])?$/);
  if (!match) return 0;
  let num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === 'K') num *= 1000;
  else if (suffix === 'M') num *= 1000000;
  return Math.floor(num);
}

module.exports = {
  normalizePhone,
  extractUrls,
  hasWhatsAppLink,
  extractPhoneFromWhatsAppLink,
  extractInstagramHandle,
  formatDate,
  isDateInRange,
  startOfDay,
  endOfDay,
  parseFollowersCount,
};
