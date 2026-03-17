#!/usr/bin/env node
/**
 * Script de teste do campaign-runner
 * Simula a lógica do scheduler sem adicionar jobs ao Redis (dry run)
 *
 * Uso:
 *   node scheduler/test-campaign-runner.js          # dry run (não enfileira)
 *   node scheduler/test-campaign-runner.js --real   # executa de verdade
 */

require('dotenv').config();
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const { addJob, QUEUE_NAMES } = require('../queue/redis');
const logger = require('../utils/logger');

const DRY_RUN = !process.argv.includes('--real');

async function run() {
  console.log('\n=== Teste do Campaign Runner ===');
  console.log(`Modo: ${DRY_RUN ? 'DRY RUN (não enfileira jobs)' : 'REAL (enfileira jobs)'}\n`);

  try {
    const campaigns = await campaignsRepo.getActiveCampaigns();
    console.log(`Campanhas ativas encontradas: ${campaigns.length}\n`);

    if (campaigns.length === 0) {
      console.log('Nenhuma campanha ativa. Verifique:');
      console.log('  - status = "ativo"');
      console.log('  - data_de_inicio <= hoje');
      console.log('  - data_de_termino >= hoje\n');
      return;
    }

    for (const campaign of campaigns) {
      const leadsToday = await leadsRepo.countLeadsToday(campaign.id);
      const deficit = campaign.meta_de_leads_diarios - leadsToday;

      console.log(`Campanha #${campaign.id} - ${campaign.nome}`);
      console.log(`  Tipo: ${campaign.tipo}`);
      console.log(`  Meta diária: ${campaign.meta_de_leads_diarios}`);
      console.log(`  Leads hoje: ${leadsToday}`);
      console.log(`  Déficit: ${deficit}`);

      if (deficit <= 0) {
        console.log('  → Meta atingida, nenhum job será criado\n');
        continue;
      }

      const limit = Math.min(deficit, 20);
      const filters = {
        cidade_alvo: campaign.cidade_alvo,
        palavras_chave: campaign.palavras_chave || [],
        seguidores_minimos: campaign.seguidores_minimos || 0,
      };

      const queueName = QUEUE_NAMES[campaign.tipo] || 'lead-discovery-default';
      console.log(`  → Jobs a criar: ${limit} (fila: ${queueName})`);
      console.log(`  → Filtros:`, JSON.stringify(filters));

      if (!DRY_RUN) {
        const job = await addJob({
          campaign_id: campaign.id,
          campaign_type: campaign.tipo,
          filters,
          limit,
        });
        console.log(`  ✓ Job adicionado: ${job.id}\n`);
      } else {
        console.log('  [DRY RUN] Job não adicionado\n');
      }
    }

    console.log('=== Fim do teste ===\n');
  } catch (err) {
    console.error('Erro:', err.message);
    logger.error({ err }, 'Test run failed');
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
