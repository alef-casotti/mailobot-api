#!/usr/bin/env node
/**
 * Teste específico para campanhas NEGOCIO_LOCAL
 * Rastreia parâmetros e identifica por que não traz resultados
 *
 * Uso:
 *   node scheduler/test-negocio-local.js [campaign_id]     # dry: só mostra params
 *   node scheduler/test-negocio-local.js [campaign_id] --params   # idem
 *   node scheduler/test-negocio-local.js [campaign_id] --maps      # só Google Maps (rápido)
 *   node scheduler/test-negocio-local.js [campaign_id] --full      # Maps + Instagram (completo)
 */

require('dotenv').config();
const campaignsRepo = require('../database/campaigns-repository');
const mapsScraper = require('../scrapers/maps-scraper');

const args = process.argv.slice(2);
const campaignIdArg = args.find((a) => !a.startsWith('--'));
const campaignId = campaignIdArg ? parseInt(campaignIdArg, 10) : null;
const mode = args.includes('--full') ? 'full' : args.includes('--maps') ? 'maps' : 'params';

function log(msg, data = '') {
  console.log(msg, data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : data) : '');
}

async function run() {
  console.log('\n=== Teste NEGOCIO_LOCAL ===\n');

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
      campaign = active.find((c) => c.tipo === 'NEGOCIO_LOCAL') || active[0];
      if (!campaign) {
        console.error('Nenhuma campanha ativa. Crie uma campanha NEGOCIO_LOCAL primeiro.');
        process.exit(1);
      }
      console.log(`Usando primeira campanha ativa: #${campaign.id}\n`);
    }

    if (campaign.tipo !== 'NEGOCIO_LOCAL') {
      console.log(`Campanha #${campaign.id} é tipo "${campaign.tipo}", não NEGOCIO_LOCAL.`);
      console.log('Parâmetros podem variar. Continuando...\n');
    }

    // 2. Simular exatamente o que o maps-worker faz
    const filters = {
      cidade_alvo: campaign.cidade_alvo,
      palavras_chave: campaign.palavras_chave || [],
      seguidores_minimos: campaign.seguidores_minimos || 0,
    };

    const palavras_chave = filters.palavras_chave || campaign.palavras_chave || [];
    const query = Array.isArray(palavras_chave)
      ? [campaign.cidade_alvo, ...palavras_chave].filter(Boolean).join(' ')
      : `${campaign.cidade_alvo} ${palavras_chave}`.trim();

    const options = {
      query: query || campaign.cidade_alvo,
      cidade_alvo: campaign.cidade_alvo,
      palavras_chave: Array.isArray(palavras_chave) ? palavras_chave : [palavras_chave],
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

    console.log('\n--- Query montada (enviada ao Google Maps) ---');
    log('  query:', options.query);
    if (!options.query.trim()) {
      console.log('  ⚠️  QUERY VAZIA! cidade_alvo ou palavras_chave precisam estar preenchidos.');
    }

    console.log('\n--- Options para discoverLocalBusinessLeads ---');
    log('  options:', options);

    // Critérios para virar lead
    console.log('\n--- Critérios para virar lead ---');
    console.log('  1. Negócio no Google Maps com link do Instagram');
    console.log('  2. Perfil Instagram com seguidores >=', options.seguidores_minimos);
    console.log('  3. Bio do Instagram com link WhatsApp (wa.me ou api.whatsapp.com)');

    if (mode === 'params') {
      console.log('\n--- Fim (modo params) ---');
      console.log('  Use --maps para testar só o Google Maps');
      console.log('  Use --full para rodar o fluxo completo (Maps + Instagram)\n');
      process.exit(0);
    }

    // 4. Executar Maps (e opcionalmente full)
    if (mode === 'maps') {
      console.log('\n--- Executando searchGoogleMaps ---');
      const { results: businesses } = await mapsScraper.searchGoogleMaps(options.query, 10);
      console.log(`  Negócios encontrados: ${businesses.length}`);
      const comInstagram = businesses.filter((b) => b.instagram);
      const semInstagram = businesses.length - comInstagram.length;
      console.log(`  Com Instagram: ${comInstagram.length}`);
      console.log(`  Sem Instagram: ${semInstagram}`);
      if (businesses.length > 0) {
        console.log('\n  Primeiros resultados:');
        businesses.slice(0, 5).forEach((b, i) => {
          console.log(`    ${i + 1}. Nome: ${b.nome} | instagram: ${b.instagram || '-'} | tel: ${b.telefone || '-'} | site: ${b.site ? 'sim' : 'não'}`);
        });
      }
      if (businesses.length === 0) {
        console.log('\n  Possíveis causas: query sem resultados, seletor do Maps mudou, ou timeout.');
      }
      console.log('\n');
      process.exit(0);
    }

    if (mode === 'full') {
      console.log('\n--- Executando discoverLocalBusinessLeads (Maps + Instagram) ---');
      const excludeIdentifiers = await require('../database/leads-repository').getExistingIdentifiers();
      const { leads } = await mapsScraper.discoverLocalBusinessLeads({ ...options, excludeIdentifiers });
      console.log(`  Leads qualificados: ${leads.length}`);
      if (leads.length > 0) {
        console.log('\n  Leads:');
        leads.forEach((l, i) => {
          console.log(`    ${i + 1}. Nome: ${l.nome} | @${l.instagram || '-'} | seg: ${l.seguidores} | tel: ${l.telefone || '-'}`);
        });
      } else {
        console.log('\n  Nenhum lead. Verifique:');
        console.log('  - Negócios no Maps têm Instagram? (rode com --maps)');
        console.log('  - Perfis têm link WhatsApp na bio?');
        console.log('  - seguidores_minimos não está alto demais?');
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
