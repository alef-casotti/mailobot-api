require('dotenv').config();
const { createWorker, QUEUE_NAMES } = require('../queue/redis');
const instagramScraper = require('../scrapers/instagram-scraper');
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const logger = require('../utils/logger');

async function processInstagramJob(job) {
  const { campaign_id, campaign_type, filters, limit } = job.data;

  const campaign = await campaignsRepo.getById(campaign_id);
  if (!campaign) {
    return { skipped: true, reason: 'Campaign not found' };
  }

  const palavras_chave = filters.palavras_chave || campaign.palavras_chave || [];
  const hashtags = Array.isArray(palavras_chave)
    ? palavras_chave.map((p) => (p.startsWith('#') ? p : `#${p}`))
    : [`#${palavras_chave}`];

  const leads = await instagramScraper.discoverInstagramProfiles({
    hashtags,
    local: campaign.cidade_alvo,
    seguidores_minimos: filters.seguidores_minimos ?? campaign.seguidores_minimos ?? 0,
    limit: limit || 10,
  });

  let saved = 0;
  for (const lead of leads) {
    const savedLead = await leadsRepo.save({
      campaign_id,
      nome: lead.nome,
      telefone: lead.telefone,
      instagram: lead.instagram,
      seguidores: lead.seguidores,
      cidade: lead.cidade,
      origem: lead.origem,
    });
    if (savedLead) saved++;
  }

  logger.info({ campaignId: campaign_id, discovered: leads.length, saved }, 'Instagram job completed');
  return { discovered: leads.length, saved };
}

const worker = createWorker(QUEUE_NAMES.DESCOBERTA_NO_INSTAGRAM, processInstagramJob);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
});

logger.info('Instagram worker started');
