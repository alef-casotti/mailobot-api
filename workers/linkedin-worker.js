require('dotenv').config();
const { createWorker, QUEUE_NAMES } = require('../queue/redis');
const linkedinScraper = require('../scrapers/linkedin-scraper');
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const logger = require('../utils/logger');

async function processLinkedInJob(job) {
  const { campaign_id, campaign_type, filters, limit } = job.data;

  const campaign = await campaignsRepo.getById(campaign_id);
  if (!campaign) {
    return { skipped: true, reason: 'Campaign not found' };
  }

  const palavras_chave = filters.palavras_chave || campaign.palavras_chave || [];
  const hashtags = Array.isArray(palavras_chave)
    ? palavras_chave.filter(Boolean)
    : [palavras_chave].filter(Boolean);

  const excludeIdentifiers = await leadsRepo.getExistingIdentifiers();

  const leads = await linkedinScraper.discoverLinkedInCompanies({
    palavras_chave: hashtags,
    cidade_alvo: filters.cidade_alvo || campaign.cidade_alvo,
    limit: limit || 10,
    excludeIdentifiers,
  });

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
      linkedin_url: lead.linkedin_url,
      industria: lead.industria,
      website: lead.website,
      descricao: lead.descricao,
    });
    if (savedLead) saved++;
  }

  logger.info({ campaignId: campaign_id, discovered: leads.length, saved }, 'LinkedIn job completed');
  return { discovered: leads.length, saved };
}

const worker = createWorker(QUEUE_NAMES.EMPRESAS_LINKEDIN, processLinkedInJob);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
});

logger.info('LinkedIn worker started');
