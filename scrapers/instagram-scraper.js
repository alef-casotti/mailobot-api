const { chromium } = require('playwright');
const { hasWhatsAppLink, extractPhoneFromWhatsAppLink, parseFollowersCount } = require('../utils/helpers');
const logger = require('../utils/logger');

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const DELAY_MS = parseInt(process.env.SCRAPER_DELAY_MS, 10) || 2000;
const TIMEOUT_MS = parseInt(process.env.SCRAPER_TIMEOUT_MS, 10) || 30000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Busca perfis no Instagram por hashtag ou local
 * @param {object} options - { hashtags, local, seguidores_minimos, limit }
 * @returns {Promise<Array<{nome, instagram, seguidores, bio, hasWhatsApp}>>}
 */
async function discoverInstagramProfiles(options) {
  const {
    hashtags = [],
    local,
    seguidores_minimos = 0,
    limit = 10,
  } = options;

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

    const searchTerms = hashtags.length ? hashtags : (local ? [local] : []);
    if (!searchTerms.length) {
      await browser.close();
      return [];
    }

    for (const term of searchTerms) {
      if (leads.length >= limit) break;

      const searchQuery = term.startsWith('#') ? term : `#${term}`;
      const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(searchQuery.replace('#', ''))}/`;

      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await sleep(DELAY_MS);

      const links = await page.$$eval('a[href^="/p/"]', (as) =>
        as.slice(0, 12).map((a) => a.href)
      );

      for (const postUrl of links) {
        if (leads.length >= limit) break;
        try {
          await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
          await sleep(1000);

          const profileLink = await page.$('a[href^="/"][href*="/"]');
          if (!profileLink) continue;
          const href = await profileLink.getAttribute('href');
          const username = href ? href.split('/').filter(Boolean)[0] : null;
          if (!username || seen.has(username)) continue;
          seen.add(username);

          const profileUrl = `https://www.instagram.com/${username}/`;
          await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
          await sleep(DELAY_MS);

          let seguidores = 0;
          let bio = '';
          let nome = username;

          const metaDesc = await page.$('meta[name="description"]');
          if (metaDesc) {
            const content = await metaDesc.getAttribute('content') || '';
            const followersMatch = content.match(/([\d.,]+[KkMm]?)\s*Followers?/i) || content.match(/([\d.,]+)\s*seguidores?/i);
            if (followersMatch) seguidores = parseFollowersCount(followersMatch[1]);
            bio = content;
            const nameMatch = content.match(/^([^–-]+)/);
            if (nameMatch) nome = nameMatch[1].trim();
          }

          const hasWhatsApp = hasWhatsAppLink(bio);

          if (seguidores >= seguidores_minimos) {
            const telefone = hasWhatsApp ? extractPhoneFromWhatsAppLink(bio) : null;
            leads.push({
              nome,
              instagram: username,
              seguidores,
              bio,
              hasWhatsApp,
              telefone,
              cidade: local,
              origem: 'instagram',
            });
          }
        } catch (e) {
          logger.debug({ err: e.message }, 'Error extracting profile');
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
  discoverInstagramProfiles,
};
