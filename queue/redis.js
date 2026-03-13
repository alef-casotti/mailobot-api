require('dotenv').config();
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../utils/logger');

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const QUEUE_NAMES = {
  NEGOCIO_LOCAL: 'lead-discovery-maps',
  DESCOBERTA_NO_INSTAGRAM: 'lead-discovery-instagram',
  INTENCAO_DE_COMPRA: 'lead-discovery-intent',
};

/**
 * Retorna nome da fila para o tipo de campanha
 */
function getQueueName(campaignType) {
  return QUEUE_NAMES[campaignType] || 'lead-discovery-default';
}

/**
 * Cria e retorna a fila de jobs
 */
function getQueue(campaignType) {
  const name = getQueueName(campaignType);
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
    },
  });
}

/**
 * Adiciona job à fila apropriada para o tipo de campanha
 * @param {object} jobData - { campaign_id, campaign_type, filters, limit }
 */
async function addJob(jobData) {
  const { campaign_id, campaign_type, filters = {}, limit = 10 } = jobData;
  const queue = getQueue(campaign_type);
  const job = await queue.add('discover', {
    campaign_id,
    campaign_type,
    filters,
    limit,
  });
  logger.info({ jobId: job.id, campaignId: campaign_id, type: campaign_type }, 'Job added to queue');
  return job;
}

/**
 * Cria worker que processa jobs de uma fila específica
 * @param {string} queueName - Nome da fila (ex: lead-discovery-maps)
 * @param {function} processor - async (job) => { ... }
 */
function createWorker(queueName, processor) {
  return new Worker(
    queueName,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing job');
      return processor(job);
    },
    {
      connection,
      concurrency: 1,
    }
  );
}

module.exports = {
  connection,
  getQueue,
  getQueueName,
  addJob,
  createWorker,
  QUEUE_NAMES,
};
