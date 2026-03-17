#!/usr/bin/env node
/**
 * Teste específico para campanhas EMPRESAS_LINKEDIN
 * Rastreia parâmetros e identifica por que não traz resultados
 *
 * Uso:
 *   node scheduler/test-linkedin.js [campaign_id]     # dry: só mostra params
 *   node scheduler/test-linkedin.js [campaign_id] --params   # idem
 *   node scheduler/test-linkedin.js [campaign_id] --full     # executa scraper completo
 */

require('dotenv').config();
const campaignsRepo = require('../database/campaigns-repository');
const leadsRepo = require('../database/leads-repository');
const linkedinScraper = require('../scrapers/linkedin-scraper');

const args = process.argv.slice(2);
const campaignIdArg = args.find((a) => !a.startsWith('--'));
const campaignId = campaignIdArg ? parseInt(campaignIdArg, 10) : null;
const mode = args.includes('--full') ? 'full' : 'params';

function log(msg, data = '') {
  console.log(msg, data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : data) : '');
}

async function run() {
  console.log('\n=== Teste EMPRESAS_LINKEDIN ===\n');

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
      campaign = active.find((c) => c.tipo === 'EMPRESAS_LINKEDIN') || active[0];
      if (!campaign) {
        console.error('Nenhuma campanha ativa. Crie uma campanha EMPRESAS_LINKEDIN primeiro.');
        process.exit(1);
      }
      console.log(`Usando primeira campanha ativa: #${campaign.id}\n`);
    }

    if (campaign.tipo !== 'EMPRESAS_LINKEDIN') {
      console.log(`Campanha #${campaign.id} é tipo "${campaign.tipo}", não EMPRESAS_LINKEDIN.`);
      console.log('Parâmetros podem variar. Continuando...\n');
    }

    // 2. Simular exatamente o que o linkedin-worker faz
    const filters = {
      cidade_alvo: campaign.cidade_alvo,
      palavras_chave: campaign.palavras_chave || [],
    };

    const palavras_chave = filters.palavras_chave || campaign.palavras_chave || [];
    const hashtags = Array.isArray(palavras_chave)
      ? palavras_chave.filter(Boolean)
      : [palavras_chave].filter(Boolean);

    const options = {
      palavras_chave: hashtags,
      cidade_alvo: campaign.cidade_alvo,
      limit: 5,
    };

    // 3. Mostrar fluxo de parâmetros
    console.log('--- Parâmetros da campanha (banco) ---');
    log('  cidade_alvo:', campaign.cidade_alvo);
    log('  palavras_chave:', campaign.palavras_chave);
    log('  meta_de_leads_diarios:', campaign.meta_de_leads_diarios);
    log('  tipo:', campaign.tipo);

    console.log('\n--- Filtros enviados ao job ---');
    log('  filters:', filters);

    console.log('\n--- Keywords montadas (busca LinkedIn) ---');
    const keywords = campaign.cidade_alvo && campaign.cidade_alvo.trim()
      ? `${hashtags.join(' ')} ${campaign.cidade_alvo.trim()}`
      : hashtags.join(' ');
    log('  keywords:', keywords);
    if (!keywords.trim()) {
      console.log('  ⚠️  KEYWORDS VAZIAS! palavras_chave precisam estar preenchidos.');
    }

    console.log('\n--- Options para discoverLinkedInCompanies ---');
    log('  options:', options);

    // Critérios para virar lead
    console.log('\n--- Critérios para virar lead ---');
    console.log('  1. Empresas encontradas na busca do LinkedIn');
    console.log('  2. Dados extraídos: nome, URL, indústria, funcionários, site, descrição, localização');
    console.log('  3. Origem: linkedin');

    if (mode === 'params') {
      console.log('\n--- Fim (modo params) ---');
      console.log('  Use --full para rodar o fluxo completo (LinkedIn)\n');
      process.exit(0);
    }

    if (mode === 'full') {
      console.log('\n--- Executando discoverLinkedInCompanies ---');
      const excludeIdentifiers = await leadsRepo.getExistingIdentifiers();
      const leads = await linkedinScraper.discoverLinkedInCompanies({
        ...options,
        excludeIdentifiers,
      });
      console.log(`  Empresas encontradas: ${leads.length}`);
      if (leads.length > 0) {
        console.log('\n  Leads:');
        leads.forEach((l, i) => {
          console.log(
            `    ${i + 1}. ${l.nome} | ${l.linkedin_url || '-'} | ind: ${l.industria || '-'} | func: ${l.seguidores} | site: ${l.website || '-'}`
          );
        });
      } else {
        console.log('\n  Nenhuma empresa. Verifique:');
        console.log('  - LINKEDIN_USER e LINKEDIN_PASSWORD no .env');
        console.log('  - Keywords retornam resultados?');
        console.log('  - LinkedIn pode estar bloqueando (tente headless: false)');
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
