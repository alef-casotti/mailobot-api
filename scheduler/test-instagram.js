#!/usr/bin/env node
/**
 * Teste específico para campanhas DESCOBERTA_NO_INSTAGRAM
 * Rastreia parâmetros e identifica por que não traz resultados
 *
 * Uso:
 *   node scheduler/test-instagram.js [campaign_id]     # dry: só mostra params
 *   node scheduler/test-instagram.js [campaign_id] --params   # idem
 *   node scheduler/test-instagram.js [campaign_id] --full     # executa scraper completo
 */

require('dotenv').config();
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const instagramScraper = require('../scrapers/instagram-scraper');

const args = process.argv.slice(2);
const campaignIdArg = args.find((a) => !a.startsWith('--'));
const campaignId = campaignIdArg ? parseInt(campaignIdArg, 10) : null;
const mode = args.includes('--full') ? 'full' : 'params';

function log(msg, data = '') {
  console.log(msg, data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : data) : '');
}

async function run() {
  console.log('\n=== Teste DESCOBERTA_NO_INSTAGRAM ===\n');

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
      campaign = active.find((c) => c.tipo === 'DESCOBERTA_NO_INSTAGRAM') || active[0];
      if (!campaign) {
        console.error('Nenhuma campanha ativa. Crie uma campanha DESCOBERTA_NO_INSTAGRAM primeiro.');
        process.exit(1);
      }
      console.log(`Usando primeira campanha ativa: #${campaign.id}\n`);
    }

    if (campaign.tipo !== 'DESCOBERTA_NO_INSTAGRAM') {
      console.log(`Campanha #${campaign.id} é tipo "${campaign.tipo}", não DESCOBERTA_NO_INSTAGRAM.`);
      console.log('Parâmetros podem variar. Continuando...\n');
    }

    // 2. Simular exatamente o que o instagram-worker faz
    const filters = {
      cidade_alvo: campaign.cidade_alvo,
      palavras_chave: campaign.palavras_chave || [],
      seguidores_minimos: campaign.seguidores_minimos || 0,
    };

    const palavras_chave = filters.palavras_chave || campaign.palavras_chave || [];
    const hashtags = Array.isArray(palavras_chave)
      ? palavras_chave.map((p) => (p.startsWith('#') ? p : `#${p}`))
      : [`#${palavras_chave}`];

    const options = {
      hashtags,
      local: campaign.cidade_alvo,
      seguidores_minimos: filters.seguidores_minimos ?? campaign.seguidores_minimos ?? 0,
      limit: 5,
    };

    // 3. Mostrar fluxo de parâmetros
    console.log('--- Parâmetros da campanha (banco) ---');
    log('  cidade_alvo:', campaign.cidade_alvo);
    log('  palavras_chave:', campaign.palavras_chave);
    log('  seguidores_minimos:', campaign.seguidores_minimos);
    log('  tipo:', campaign.tipo);

    console.log('\n--- Filtros enviados ao job ---');
    log('  filters:', filters);

    console.log('\n--- Hashtags montadas (explore/tags/...) ---');
    log('  hashtags:', options.hashtags);
    if (!options.hashtags.length || (options.hashtags.length === 1 && !options.hashtags[0].replace('#', ''))) {
      console.log('  ⚠️  HASHTAGS VAZIAS! palavras_chave precisam estar preenchidos.');
    }

    console.log('\n--- Options para discoverInstagramProfiles ---');
    log('  options:', options);

    // Critérios para virar lead
    console.log('\n--- Critérios para virar lead ---');
    console.log('  1. Perfis de autores de posts nas hashtags');
    console.log('  2. Seguidores >=', options.seguidores_minimos);
    console.log('  3. Telefone extraído da bio (se tiver link WhatsApp)');

    if (mode === 'params') {
      console.log('\n--- Fim (modo params) ---');
      console.log('  Use --full para rodar o fluxo completo (Instagram)\n');
      process.exit(0);
    }

    if (mode === 'full') {
      console.log('\n--- Executando discoverInstagramProfiles ---');
      const excludeIdentifiers = await leadsRepo.getExistingIdentifiers();
      const leads = await instagramScraper.discoverInstagramProfiles({
        ...options,
        excludeIdentifiers,
      });
      console.log(`  Leads qualificados: ${leads.length}`);
      if (leads.length > 0) {
        console.log('\n  Leads:');
        leads.forEach((l, i) => {
          console.log(
            `    ${i + 1}. Nome: ${l.nome} | @${l.instagram || '-'} | seg: ${l.seguidores} | tel: ${l.telefone || '-'} | WhatsApp: ${l.hasWhatsApp ? 'sim' : 'não'}`
          );
        });
      } else {
        console.log('\n  Nenhum lead. Verifique:');
        console.log('  - Hashtags retornam posts?');
        console.log('  - Perfis têm seguidores >=', options.seguidores_minimos, '?');
        console.log('  - Muitos perfis já estão em excludeIdentifiers?');
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
