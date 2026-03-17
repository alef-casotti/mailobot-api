const express = require('express');
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Middleware de autenticação por API Key
 */
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const expected = process.env.API_KEY;
  if (!expected || apiKey === expected) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

/**
 * Validação de campanha
 */
function validateCampaign(body, isUpdate = false) {
  const errors = [];
  const required = isUpdate ? [] : ['user_id', 'nome', 'tipo', 'data_de_inicio', 'data_de_termino'];
  const validTypes = ['NEGOCIO_LOCAL', 'DESCOBERTA_NO_INSTAGRAM', 'INTENCAO_DE_COMPRA', 'EMPRESAS_LINKEDIN'];

  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      errors.push(`Campo obrigatório: ${field}`);
    }
  }

  if (body.tipo && !validTypes.includes(body.tipo)) {
    errors.push(`tipo deve ser um de: ${validTypes.join(', ')}`);
  }

  if (body.data_de_inicio && body.data_de_termino) {
    if (new Date(body.data_de_inicio) > new Date(body.data_de_termino)) {
      errors.push('data_de_inicio deve ser anterior a data_de_termino');
    }
  }

  if (body.meta_de_leads_diarios !== undefined && (body.meta_de_leads_diarios < 1 || body.meta_de_leads_diarios > 1000)) {
    errors.push('meta_de_leads_diarios deve estar entre 1 e 1000');
  }

  return errors;
}

/**
 * POST /campaigns - Criar campanha
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const errors = validateCampaign(req.body);
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const campaign = await campaignsRepo.create(req.body);
    res.status(201).json(campaign);
  } catch (err) {
    logger.error({ err }, 'Error creating campaign');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /campaigns - Listar campanhas
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filters = {};
    if (req.query.user_id) filters.user_id = parseInt(req.query.user_id, 10);
    if (req.query.status) filters.status = req.query.status;
    if (req.query.tipo) filters.tipo = req.query.tipo;

    const campaigns = await campaignsRepo.list(filters);
    res.json(campaigns);
  } catch (err) {
    logger.error({ err }, 'Error listing campaigns');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /campaigns/:id - Detalhes da campanha
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const campaign = await campaignsRepo.getById(parseInt(req.params.id, 10));
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(campaign);
  } catch (err) {
    logger.error({ err }, 'Error fetching campaign');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /campaigns/:id - Atualizar campanha
 */
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const errors = validateCampaign(req.body, true);
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const campaign = await campaignsRepo.update(parseInt(req.params.id, 10), req.body);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(campaign);
  } catch (err) {
    logger.error({ err }, 'Error updating campaign');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /campaigns/:id/leads - Listar leads da campanha
 */
router.get('/:id/leads', authMiddleware, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const campaign = await campaignsRepo.getById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const leads = await leadsRepo.listByCampaign(campaignId, limit);
    res.json(leads);
  } catch (err) {
    logger.error({ err }, 'Error listing leads');
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
