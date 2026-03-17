const pool = require('./db');
const logger = require('../utils/logger');

/**
 * Retorna o último lugar processado para retomar o scraper
 * @param {number} campaignId
 * @returns {Promise<string|null>}
 */
async function getLastProcessedPlace(campaignId) {
  const result = await pool.query(
    `SELECT last_place_identifier FROM campaign_scraper_state WHERE campaign_id = $1`,
    [campaignId]
  );
  return result.rows[0]?.last_place_identifier || null;
}

/**
 * Salva o último lugar processado para retomar na próxima execução
 * @param {number} campaignId
 * @param {string} identifier
 */
async function saveLastProcessedPlace(campaignId, identifier) {
  if (!identifier) return;
  await pool.query(
    `INSERT INTO campaign_scraper_state (campaign_id, last_place_identifier, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (campaign_id) DO UPDATE SET
       last_place_identifier = EXCLUDED.last_place_identifier,
       updated_at = NOW()`,
    [campaignId, identifier]
  );
  logger.debug({ campaignId, identifier }, 'Scraper state saved');
}

module.exports = {
  getLastProcessedPlace,
  saveLastProcessedPlace,
};
