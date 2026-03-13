const pool = require('./db');
const logger = require('../utils/logger');
const { startOfDay, endOfDay } = require('../utils/helpers');
const { normalizePhone } = require('../utils/helpers');

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
 * @returns {object|null} Lead existente ou null
 */
async function findDuplicate(telefone, instagram, email) {
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

  if (!hasPhone && !hasInstagram && !hasEmail) {
    logger.debug('Lead skipped: no phone, instagram or email');
    return null;
  }

  const duplicate = await findDuplicate(
    lead.telefone,
    lead.instagram,
    lead.email
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
  } = lead;

  const result = await pool.query(
    `INSERT INTO leads (campaign_id, nome, telefone, instagram, email, seguidores, cidade, origem, pontuacao, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
    ]
  );
  logger.info({ leadId: result.rows[0].id, campaignId: campaign_id }, 'Lead saved');
  return result.rows[0];
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
};
