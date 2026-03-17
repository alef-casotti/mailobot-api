const { chromium } = require('playwright');
const { parseFollowersCount } = require('../utils/helpers');
const logger = require('../utils/logger');

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const DELAY_MS = parseInt(process.env.SCRAPER_DELAY_MS, 10) || 2000;
const TIMEOUT_MS = parseInt(process.env.SCRAPER_TIMEOUT_MS, 10) || 30000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Pontua intenção de compra baseado em engajamento
 * @param {object} signals - { comentarios, curtidas, compartilhamentos }
 * @returns {number} 0-100
 */
function scoreIntent(signals) {
  let score = 0;
  if (signals.comentarios > 0) score += 30;
  if (signals.curtidas > 10) score += 20;
  if (signals.curtidas > 50) score += 20;
  if (signals.compartilhamentos > 0) score += 30;
  return Math.min(100, score);
}

/**
 * Busca publicações por hashtags e extrai usuários engajados
 * @param {object} options - { hashtags, limit, excludeIdentifiers }
 * @returns {Promise<Array<{nome, instagram, seguidores, pontuacao, origem}>>}
 */
async function discoverIntentLeads(options) {
  const { hashtags = [], limit = 10, excludeIdentifiers = {} } = options;

  const excludeInstagrams = excludeIdentifiers.instagrams || new Set();

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  const leads = [];
  const seen = new Set();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);

    const searchTerms = hashtags.map((h) => (h.startsWith('#') ? h.slice(1) : h));
    if (!searchTerms.length) {
      await browser.close();
      return [];
    }

    for (const tag of searchTerms) {
      if (leads.length >= limit) break;

      const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await sleep(DELAY_MS);

      const postLinks = await page.$$eval('a[href^="/p/"]', (as) =>
        as.slice(0, 15).map((a) => a.href)
      );

      for (const postUrl of postLinks) {
        if (leads.length >= limit) break;
        try {
          await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
          await sleep(1000);

          const commentLinks = await page.$$eval('a[href^="/"][role="link"]', (as) =>
            as
              .map((a) => a.getAttribute('href'))
              .filter((h) => h && h.match(/^\/[a-zA-Z0-9_.]+\/?$/) && !h.includes('/p/'))
          );

          const uniqueUsers = [...new Set(commentLinks)];

          for (const userPath of uniqueUsers.slice(0, 5)) {
            if (leads.length >= limit) break;
            const username = userPath.replace(/\//g, '');
            if (!username || seen.has(username)) continue;
            if (excludeInstagrams.has(username.toLowerCase())) continue;
            seen.add(username);

            await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
            await sleep(800);

            let seguidores = 0;
            let nome = username;

            const metaDesc = await page.$('meta[name="description"]');
            if (metaDesc) {
              const content = await metaDesc.getAttribute('content') || '';
              const followersMatch = content.match(/([\d.,]+[KkMm]?)\s*Followers?/i);
              if (followersMatch) seguidores = parseFollowersCount(followersMatch[1]);
              const nameMatch = content.match(/^([^–-]+)/);
              if (nameMatch) nome = nameMatch[1].trim();
            }

            const pontuacao = scoreIntent({
              comentarios: 1,
              curtidas: 10,
              compartilhamentos: 0,
            });

            if (pontuacao >= 20) {
              leads.push({
                nome,
                instagram: username,
                seguidores,
                pontuacao,
                cidade: null,
                origem: 'intencao_compra',
              });
            }
          }
        } catch (e) {
          logger.debug({ err: e.message }, 'Error extracting intent lead');
        }
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
  discoverIntentLeads,
  scoreIntent,
};
