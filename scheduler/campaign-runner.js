require('dotenv').config();
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const { addJob } = require('../queue/redis');
const logger = require('../utils/logger');

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutos

async function run() {
  try {
    const campaigns = await campaignsRepo.getActiveCampaigns();
    logger.info({ count: campaigns.length }, 'Active campaigns fetched');

    for (const campaign of campaigns) {
      const leadsToday = await leadsRepo.countLeadsToday(campaign.id);
      const deficit = campaign.meta_de_leads_diarios - leadsToday;

      if (deficit <= 0) {
        logger.debug({ campaignId: campaign.id }, 'Campaign daily target reached');
        continue;
      }

      const filters = {
        cidade_alvo: campaign.cidade_alvo,
        palavras_chave: campaign.palavras_chave || [],
        seguidores_minimos: campaign.seguidores_minimos || 0,
      };

      await addJob({
        campaign_id: campaign.id,
        campaign_type: campaign.tipo,
        filters,
        limit: Math.min(deficit, 20),
      });
    }
  } catch (err) {
    logger.error({ err }, 'Scheduler run failed');
  }
}

async function start() {
  logger.info('Scheduler started');
  await run();
  setInterval(run, INTERVAL_MS);
}

start().catch((err) => {
  logger.error({ err }, 'Scheduler fatal error');
  process.exit(1);
});
