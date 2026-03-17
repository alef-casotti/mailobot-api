const pool = require('./db');
const logger = require('../utils/logger');
const { startOfDay, endOfDay } = require('../utils/helpers');
const { normalizePhone } = require('../utils/helpers');

/**
 * Normaliza URL do LinkedIn para comparação (remove trailing slash, query params)
 */
function normalizeLinkedInUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (!u.hostname.includes('linkedin.com')) return null;
    const path = u.pathname.replace(/\/$/, '') || '/';
    return `https://www.linkedin.com${path}`;
  } catch {
    return null;
  }
}

/**
 * Conta leads criados hoje para uma campanha
 */
async function countLeadsToday(campaignId) {
  const start = startOfDay();
  const end = endOfDay();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM leads
     WHERE campaign_id = $1 AND criado_em >= $2 AND criado_em <= $3`,
    [campaignId, start, end]
  );
  return result.rows[0].count;
}

/**
 * Verifica se já existe lead com os mesmos identificadores (desduplicação)
 * @param {string} [telefone]
 * @param {string} [instagram]
 * @param {string} [email]
 * @param {string} [linkedin_url]
 * @returns {object|null} Lead existente ou null
 */
async function findDuplicate(telefone, instagram, email, linkedin_url) {
  const conditions = [];
  const values = [];
  let i = 1;

  const normalizedPhone = telefone ? normalizePhone(telefone) : null;
  if (normalizedPhone && normalizedPhone.length >= 10) {
    conditions.push(`regexp_replace(COALESCE(telefone, ''), '\\D', '', 'g') = $${i}`);
    values.push(normalizedPhone);
    i++;
  }
  if (instagram && instagram.trim()) {
    conditions.push(`LOWER(TRIM(instagram)) = LOWER(TRIM($${i}))`);
    values.push(instagram.trim());
    i++;
  }
  if (email && email.trim()) {
    conditions.push(`LOWER(TRIM(email)) = LOWER(TRIM($${i}))`);
    values.push(email.trim());
    i++;
  }
  const normLinkedIn = linkedin_url ? normalizeLinkedInUrl(linkedin_url) : null;
  if (normLinkedIn) {
    conditions.push(`LOWER(TRIM(linkedin_url)) = $${i}`);
    values.push(normLinkedIn.toLowerCase());
    i++;
  }

  if (conditions.length === 0) return null;

  const result = await pool.query(
    `SELECT * FROM leads WHERE ${conditions.join(' OR ')} LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Salva lead (com verificação de duplicata)
 * @param {object} lead
 * @returns {object|null} Lead salvo ou null se duplicado
 */
async function save(lead) {
  const hasPhone = lead.telefone && normalizePhone(lead.telefone).length >= 10;
  const hasInstagram = lead.instagram && lead.instagram.trim().length > 0;
  const hasEmail = lead.email && lead.email.trim().length > 0;
  const hasLinkedIn = lead.linkedin_url && normalizeLinkedInUrl(lead.linkedin_url);

  if (!hasPhone && !hasInstagram && !hasEmail && !hasLinkedIn) {
    logger.debug('Lead skipped: no phone, instagram, email or linkedin_url');
    return null;
  }

  const duplicate = await findDuplicate(
    lead.telefone,
    lead.instagram,
    lead.email,
    lead.linkedin_url
  );
  if (duplicate) {
    logger.debug({ duplicateId: duplicate.id }, 'Lead duplicate skipped');
    return null;
  }

  const {
    campaign_id,
    nome,
    telefone,
    instagram,
    email,
    seguidores = 0,
    cidade,
    origem,
    pontuacao = 0,
    status = 'novo',
    linkedin_url,
    industria,
    website,
    descricao,
  } = lead;

  const result = await pool.query(
    `INSERT INTO leads (campaign_id, nome, telefone, instagram, email, seguidores, cidade, origem, pontuacao, status, linkedin_url, industria, website, descricao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      campaign_id,
      nome || null,
      telefone || null,
      instagram || null,
      email || null,
      seguidores,
      cidade || null,
      origem || null,
      pontuacao,
      status,
      linkedin_url ? normalizeLinkedInUrl(linkedin_url) : null,
      industria || null,
      website || null,
      descricao || null,
    ]
  );
  logger.info({ leadId: result.rows[0].id, campaignId: campaign_id }, 'Lead saved');
  return result.rows[0];
}

/**
 * Retorna identificadores já existentes (para "continuar de onde parou")
 * @param {number} [campaignId] - Se informado, filtra por campanha
 * @returns {Promise<{instagrams: Set<string>, telefones: Set<string>, emails: Set<string>, linkedinUrls: Set<string>}>}
 */
async function getExistingIdentifiers(campaignId = null) {
  const where = campaignId ? 'WHERE campaign_id = $1' : '';
  const values = campaignId ? [campaignId] : [];
  const result = await pool.query(
    `SELECT instagram, telefone, email, linkedin_url FROM leads ${where}`,
    values
  );

  const instagrams = new Set();
  const telefones = new Set();
  const emails = new Set();
  const linkedinUrls = new Set();

  for (const row of result.rows) {
    if (row.instagram && row.instagram.trim()) {
      instagrams.add(row.instagram.trim().toLowerCase());
    }
    if (row.telefone) {
      const norm = normalizePhone(row.telefone);
      if (norm.length >= 10) telefones.add(norm);
    }
    if (row.email && row.email.trim()) {
      emails.add(row.email.trim().toLowerCase());
    }
    const normUrl = row.linkedin_url ? normalizeLinkedInUrl(row.linkedin_url) : null;
    if (normUrl) linkedinUrls.add(normUrl.toLowerCase());
  }

  return { instagrams, telefones, emails, linkedinUrls };
}

/**
 * Lista leads de uma campanha
 */
async function listByCampaign(campaignId, limit = 100) {
  const result = await pool.query(
    `SELECT * FROM leads WHERE campaign_id = $1 ORDER BY criado_em DESC LIMIT $2`,
    [campaignId, limit]
  );
  return result.rows;
}

module.exports = {
  countLeadsToday,
  findDuplicate,
  save,
  listByCampaign,
  getExistingIdentifiers,
};
