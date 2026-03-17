require('dotenv').config();
const { createWorker, QUEUE_NAMES } = require('../queue/redis');
const mapsScraper = require('../scrapers/maps-scraper');
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const scraperStateRepo = require('../database/scraper-state-repository');
const logger = require('../utils/logger');

async function processMapsJob(job) {
  const { campaign_id, campaign_type, filters, limit } = job.data;

  const campaign = await campaignsRepo.getById(campaign_id);
  if (!campaign) {
    return { skipped: true, reason: 'Campaign not found' };
  }

  const palavras_chave = filters.palavras_chave || campaign.palavras_chave || [];
  const query = Array.isArray(palavras_chave)
    ? [campaign.cidade_alvo, ...palavras_chave].filter(Boolean).join(' ')
    : `${campaign.cidade_alvo} ${palavras_chave}`.trim();

  const excludeIdentifiers = await leadsRepo.getExistingIdentifiers();
  const resumeFromPlaceIdentifier = await scraperStateRepo.getLastProcessedPlace(campaign_id);

  const { leads, lastProcessedIdentifier } = await mapsScraper.discoverLocalBusinessLeads({
    query: query || campaign.cidade_alvo,
    cidade_alvo: campaign.cidade_alvo,
    palavras_chave: Array.isArray(palavras_chave) ? palavras_chave : [palavras_chave],
    seguidores_minimos: filters.seguidores_minimos ?? campaign.seguidores_minimos ?? 0,
    limit: limit || 10,
    excludeIdentifiers,
    resumeFromPlaceIdentifier,
  });

  if (lastProcessedIdentifier) {
    await scraperStateRepo.saveLastProcessedPlace(campaign_id, lastProcessedIdentifier);
  }

  let saved = 0;
  for (const lead of leads) {
    const savedLead = await leadsRepo.save({
      campaign_id,
      nome: lead.nome,
      telefone: lead.telefone,
      instagram: lead.instagram,
      email: lead.email,
      seguidores: lead.seguidores,
      cidade: lead.cidade,
      origem: lead.origem,
    });
    if (savedLead) saved++;
  }

  logger.info({ campaignId: campaign_id, discovered: leads.length, saved }, 'Maps job completed');
  return { discovered: leads.length, saved };
}

const worker = createWorker(QUEUE_NAMES.NEGOCIO_LOCAL, processMapsJob);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
});

logger.info('Maps worker started');
