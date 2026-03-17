#!/usr/bin/env node
/**
 * Teste específico para campanhas INTENCAO_DE_COMPRA
 * Rastreia parâmetros e identifica por que não traz resultados
 *
 * Uso:
 *   node scheduler/test-intencao-compra.js [campaign_id]     # dry: só mostra params
 *   node scheduler/test-intencao-compra.js [campaign_id] --params   # idem
 *   node scheduler/test-intencao-compra.js [campaign_id] --full     # executa scraper completo
 */

require('dotenv').config();
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const intentScraper = require('../scrapers/intent-scraper');

const args = process.argv.slice(2);
const campaignIdArg = args.find((a) => !a.startsWith('--'));
const campaignId = campaignIdArg ? parseInt(campaignIdArg, 10) : null;
const mode = args.includes('--full') ? 'full' : 'params';

function log(msg, data = '') {
  console.log(msg, data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : data) : '');
}

async function run() {
  console.log('\n=== Teste INTENCAO_DE_COMPRA ===\n');

  try {
    // 1. Buscar campanha
    let campaign;
    if (campaignId) {
      campaign = await campaignsRepo.getById(campaignId);
      if (!campaign) {
        console.error(`Campanha #${campaignId} não encontrada.`);
        process.exit(1);
      }
    } else {
      const active = await campaignsRepo.getActiveCampaigns();
      campaign = active.find((c) => c.tipo === 'INTENCAO_DE_COMPRA') || active[0];
      if (!campaign) {
        console.error('Nenhuma campanha ativa. Crie uma campanha INTENCAO_DE_COMPRA primeiro.');
        process.exit(1);
      }
      console.log(`Usando primeira campanha ativa: #${campaign.id}\n`);
    }

    if (campaign.tipo !== 'INTENCAO_DE_COMPRA') {
      console.log(`Campanha #${campaign.id} é tipo "${campaign.tipo}", não INTENCAO_DE_COMPRA.`);
      console.log('Parâmetros podem variar. Continuando...\n');
    }

    // 2. Simular exatamente o que o intent-worker faz
    const filters = {
      cidade_alvo: campaign.cidade_alvo,
      palavras_chave: campaign.palavras_chave || [],
      seguidores_minimos: campaign.seguidores_minimos || 0,
    };

    const palavras_chave = filters.palavras_chave || campaign.palavras_chave || [];
    const hashtags = Array.isArray(palavras_chave)
      ? palavras_chave.filter(Boolean)
      : [palavras_chave].filter(Boolean);

    const options = {
      hashtags,
      limit: 5,
    };

    // 3. Mostrar fluxo de parâmetros
    console.log('--- Parâmetros da campanha (banco) ---');
    log('  palavras_chave:', campaign.palavras_chave);
    log('  meta_de_leads_diarios:', campaign.meta_de_leads_diarios);
    log('  tipo:', campaign.tipo);

    console.log('\n--- Filtros enviados ao job ---');
    log('  filters:', filters);

    console.log('\n--- Hashtags montadas (explore/tags/...) ---');
    log('  hashtags:', options.hashtags);
    if (!options.hashtags.length) {
      console.log('  ⚠️  HASHTAGS VAZIAS! palavras_chave precisam estar preenchidos.');
    }

    console.log('\n--- Options para discoverIntentLeads ---');
    log('  options:', options);

    // Critérios para virar lead
    console.log('\n--- Critérios para virar lead ---');
    console.log('  1. Usuários que comentam em posts das hashtags');
    console.log('  2. Pontuação >= 20 (baseada em comentários/curtidas/compartilhamentos)');
    console.log('  3. Origem: intencao_compra (leads podem não ter telefone)');

    if (mode === 'params') {
      console.log('\n--- Fim (modo params) ---');
      console.log('  Use --full para rodar o fluxo completo (Intent)\n');
      process.exit(0);
    }

    if (mode === 'full') {
      console.log('\n--- Executando discoverIntentLeads ---');
      const excludeIdentifiers = await leadsRepo.getExistingIdentifiers();
      const leads = await intentScraper.discoverIntentLeads({
        ...options,
        excludeIdentifiers,
      });
      console.log(`  Leads qualificados: ${leads.length}`);
      if (leads.length > 0) {
        console.log('\n  Leads:');
        leads.forEach((l, i) => {
          console.log(
            `    ${i + 1}. Nome: ${l.nome} | @${l.instagram || '-'} | seg: ${l.seguidores} | pontuação: ${l.pontuacao} | origem: ${l.origem}`
          );
        });
      } else {
        console.log('\n  Nenhum lead. Verifique:');
        console.log('  - Hashtags retornam posts?');
        console.log('  - Posts têm comentários de usuários?');
        console.log('  - Muitos perfis já estão em excludeIdentifiers?');
        console.log('  - Pontuação mínima 20 (comentários/curtidas/compartilhamentos)');
      }
      console.log('\n');
      process.exit(0);
    }
  } catch (err) {
    console.error('Erro:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

run();
