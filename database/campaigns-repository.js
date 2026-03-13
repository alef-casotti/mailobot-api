const pool = require('./db');
const logger = require('../utils/logger');

/**
 * Retorna campanhas ativas dentro do período vigente
 */
async function getActiveCampaigns() {
  const now = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `SELECT id, user_id, nome, tipo, cidade_alvo, palavras_chave, seguidores_minimos,
            meta_de_leads_diarios, data_de_inicio, data_de_termino, status, criado_em
     FROM campanhas
     WHERE status = 'ativo'
       AND data_de_inicio <= $1
       AND data_de_termino >= $1`,
    [now]
  );
  return result.rows;
}

/**
 * Busca campanha por ID
 */
async function getById(id) {
  const result = await pool.query(
    `SELECT * FROM campanhas WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Cria nova campanha
 */
async function create(data) {
  const {
    user_id,
    nome,
    tipo,
    cidade_alvo,
    palavras_chave,
    seguidores_minimos,
    meta_de_leads_diarios,
    data_de_inicio,
    data_de_termino,
    status = 'ativo',
  } = data;

  const result = await pool.query(
    `INSERT INTO campanhas (user_id, nome, tipo, cidade_alvo, palavras_chave, seguidores_minimos,
                           meta_de_leads_diarios, data_de_inicio, data_de_termino, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      user_id,
      nome,
      tipo,
      cidade_alvo || null,
      JSON.stringify(palavras_chave || []),
      seguidores_minimos ?? 0,
      meta_de_leads_diarios ?? 10,
      data_de_inicio,
      data_de_termino,
      status,
    ]
  );
  logger.info({ campaignId: result.rows[0].id }, 'Campaign created');
  return result.rows[0];
}

/**
 * Atualiza campanha
 */
async function update(id, data) {
  const fields = [];
  const values = [];
  let i = 1;

  const allowed = [
    'nome',
    'tipo',
    'cidade_alvo',
    'palavras_chave',
    'seguidores_minimos',
    'meta_de_leads_diarios',
    'data_de_inicio',
    'data_de_termino',
    'status',
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${i}`);
      values.push(
        key === 'palavras_chave' ? JSON.stringify(data[key]) : data[key]
      );
      i++;
    }
  }

  if (fields.length === 0) return getById(id);

  values.push(id);
  const result = await pool.query(
    `UPDATE campanhas SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Lista campanhas com filtros opcionais
 */
async function list(filters = {}) {
  const conditions = [];
  const values = [];
  let i = 1;

  if (filters.user_id) {
    conditions.push(`user_id = $${i}`);
    values.push(filters.user_id);
    i++;
  }
  if (filters.status) {
    conditions.push(`status = $${i}`);
    values.push(filters.status);
    i++;
  }
  if (filters.tipo) {
    conditions.push(`tipo = $${i}`);
    values.push(filters.tipo);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT * FROM campanhas ${where} ORDER BY criado_em DESC`,
    values
  );
  return result.rows;
}

module.exports = {
  getActiveCampaigns,
  getById,
  create,
  update,
  list,
};
