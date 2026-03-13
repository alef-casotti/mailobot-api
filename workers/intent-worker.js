require('dotenv').config();
const { createWorker, QUEUE_NAMES } = require('../queue/redis');
const intentScraper = require('../scrapers/intent-scraper');
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const logger = require('../utils/logger');

async function processIntentJob(job) {
  const { campaign_id, campaign_type, filters, limit } = job.data;

  const campaign = await campaignsRepo.getById(campaign_id);
  if (!campaign) {
    return { skipped: true, reason: 'Campaign not found' };
  }

  const palavras_chave = filters.palavras_chave || campaign.palavras_chave || [];
  const hashtags = Array.isArray(palavras_chave)
    ? palavras_chave.filter(Boolean)
    : [palavras_chave].filter(Boolean);

  const leads = await intentScraper.discoverIntentLeads({
    hashtags: hashtags.filter(Boolean),
    limit: limit || 10,
  });

  let saved = 0;
  for (const lead of leads) {
    const savedLead = await leadsRepo.save({
      campaign_id,
      nome: lead.nome,
      instagram: lead.instagram,
      seguidores: lead.seguidores,
      pontuacao: lead.pontuacao,
      cidade: lead.cidade,
      origem: lead.origem,
    });
    if (savedLead) saved++;
  }

  logger.info({ campaignId: campaign_id, discovered: leads.length, saved }, 'Intent job completed');
  return { discovered: leads.length, saved };
}

const worker = createWorker(QUEUE_NAMES.INTENCAO_DE_COMPRA, processIntentJob);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
});

logger.info('Intent worker started');
