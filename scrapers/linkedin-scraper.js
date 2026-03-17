const { chromium } = require('playwright');
const { parseFollowersCount } = require('../utils/helpers');
const { ensureAuthenticated } = require('./linkedin-auth');
const logger = require('../utils/logger');

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const DELAY_MS = parseInt(process.env.SCRAPER_DELAY_MS, 10) || 3000;
const TIMEOUT_MS = parseInt(process.env.SCRAPER_TIMEOUT_MS, 10) || 30000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parseia número de funcionários de texto LinkedIn (ex: "1,001-5,000 employees" -> 1001)
 * @param {string} str
 * @returns {number}
 */
function parseEmployeeCount(str) {
  if (!str || typeof str !== 'string') return 0;
  const match = str.match(/([\d,]+)/);
  if (!match) return 0;
  return parseInt(match[1].replace(/,/g, ''), 10) || 0;
}

/**
 * Normaliza URL do LinkedIn para formato canônico
 * @param {string} href
 * @returns {string|null}
 */
function normalizeCompanyUrl(href) {
  if (!href || typeof href !== 'string') return null;
  const match = href.match(/linkedin\.com\/company\/([a-zA-Z0-9_-]+)/i);
  if (!match) return null;
  return `https://www.linkedin.com/company/${match[1]}/`;
}

/**
 * Busca empresas no LinkedIn e extrai dados completos
 * @param {object} options - { palavras_chave, cidade_alvo, limit, excludeIdentifiers }
 * @returns {Promise<Array<{nome, linkedin_url, email, telefone, seguidores, cidade, industria, website, descricao, origem}>>}
 */
async function discoverLinkedInCompanies(options) {
  const {
    palavras_chave = [],
    cidade_alvo,
    limit = 10,
    excludeIdentifiers = {},
  } = options;

  const excludeLinkedInUrls = excludeIdentifiers.linkedinUrls || new Set();
  const searchTerms = Array.isArray(palavras_chave) ? palavras_chave.filter(Boolean) : [palavras_chave].filter(Boolean);

  if (!searchTerms.length) {
    return [];
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  const leads = [];
  const seenUrls = new Set();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);

    if (process.env.LINKEDIN_USER && process.env.LINKEDIN_PASSWORD) {
      await ensureAuthenticated(context, page);
    } else {
      logger.warn('LINKEDIN_USER e LINKEDIN_PASSWORD não definidos - busca pode exigir login');
    }

    const keywords = cidade_alvo && cidade_alvo.trim()
      ? `${searchTerms.join(' ')} ${cidade_alvo.trim()}`
      : searchTerms.join(' ');
    const searchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(keywords)}`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await sleep(DELAY_MS);

    // Extrair links de empresas da lista de resultados
    const companyLinks = await page.$$eval(
      'a[href*="/company/"]',
      (as) => as
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && h.includes('/company/') && !h.includes('/about/') && !h.includes('/people/'))
    );

    const uniqueLinks = [...new Set(companyLinks)];

    for (const href of uniqueLinks) {
      if (leads.length >= limit) break;

      const companyUrl = normalizeCompanyUrl(href);
      if (!companyUrl || seenUrls.has(companyUrl)) continue;
      if (excludeLinkedInUrls.has(companyUrl.toLowerCase())) continue;
      seenUrls.add(companyUrl);

      try {
        await page.goto(companyUrl, { waitUntil: 'domcontentloaded' });
        await sleep(DELAY_MS);

        let nome = '';
        let industria = null;
        let seguidores = 0;
        let website = null;
        let descricao = null;
        let cidade = null;

        // Nome da empresa - h1 ou meta description
        const h1 = await page.$('h1');
        if (h1) {
          nome = (await h1.textContent()).trim();
        }
        if (!nome) {
          const metaDesc = await page.$('meta[name="description"]');
          if (metaDesc) {
            const content = await metaDesc.getAttribute('content') || '';
            const nameMatch = content.match(/^([^|\-–]+)/);
            if (nameMatch) nome = nameMatch[1].trim();
          }
        }
        if (!nome) {
          nome = companyUrl.split('/company/')[1]?.replace(/\/$/, '') || 'Empresa';
        }

        // Indústria, funcionários, localização - dl ou divs de info
        const infoText = await page.evaluate(() => {
          const dl = document.querySelector('dl');
          if (dl) return dl.innerText;
          const about = document.querySelector('[data-test-id="about-us__content"]');
          if (about) return about.innerText;
          return document.body.innerText.slice(0, 3000);
        });

        if (infoText) {
          const industryMatch = infoText.match(/(?:Indústria|Industry)[:\s]+([^\n]+)/i);
          if (industryMatch) industria = industryMatch[1].trim();

          const employeesMatch = infoText.match(/([\d,]+(?:\s*-\s*[\d,]+)?)\s*(?:funcionários|employees|employés)/i);
          if (employeesMatch) {
            seguidores = parseEmployeeCount(employeesMatch[1]) || parseFollowersCount(employeesMatch[1]);
          }

          const locationMatch = infoText.match(/(?:Sede|Headquarters|Localização|Location)[:\s]+([^\n]+)/i);
          if (locationMatch) cidade = locationMatch[1].trim();
        }

        // Website - link externo (evitar linkedin, licdn)
        const extLinks = await page.$$eval('a[href^="http"]', (as) =>
          as
            .map((a) => a.href)
            .filter((h) => !h.includes('linkedin.com') && !h.includes('licdn.com'))
        );
        if (extLinks.length > 0) website = extLinks[0];

        // Descrição - seção About
        const aboutSection = await page.$('[data-test-id="about-us__content"], .about-us__content, section[aria-label*="About"]');
        if (aboutSection) {
          descricao = (await aboutSection.textContent()).trim().slice(0, 500);
        }

        leads.push({
          nome,
          linkedin_url: companyUrl,
          email: null,
          telefone: null,
          seguidores,
          cidade: cidade || cidade_alvo || null,
          industria,
          website,
          descricao,
          origem: 'linkedin',
        });
      } catch (e) {
        logger.debug({ url: companyUrl, err: e.message }, 'Error extracting LinkedIn company');
      }
    }

    await browser.close();
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }

  return leads;
}

module.exports = {
  discoverLinkedInCompanies,
  parseEmployeeCount,
  normalizeCompanyUrl,
};
