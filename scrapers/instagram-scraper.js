const { chromium } = require('playwright');
const { hasWhatsAppLink, extractPhoneFromWhatsAppLink, parseFollowersCount } = require('../utils/helpers');
const { ensureAuthenticated } = require('./instagram-auth');
const logger = require('../utils/logger');

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const DELAY_MS = parseInt(process.env.SCRAPER_DELAY_MS, 10) || 2000;
const TIMEOUT_MS = parseInt(process.env.SCRAPER_TIMEOUT_MS, 10) || 30000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Busca perfis no Instagram por hashtag ou local
 * @param {object} options - { hashtags, local, seguidores_minimos, limit, excludeIdentifiers }
 * @returns {Promise<Array<{nome, instagram, seguidores, bio, hasWhatsApp}>>}
 */
async function discoverInstagramProfiles(options) {
  const {
    hashtags = [],
    local,
    seguidores_minimos = 0,
    limit = 10,
    excludeIdentifiers = {},
  } = options;

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

    if (process.env.INSTAGRAM_USER && process.env.INSTAGRAM_PASSWORD) {
      await ensureAuthenticated(context, page);
    } else {
      logger.warn('INSTAGRAM_USER e INSTAGRAM_PASSWORD não definidos - perfis podem não carregar sem login');
    }

    const searchTerms = hashtags.length ? hashtags : (local ? [local] : []);
    if (!searchTerms.length) {
      await browser.close();
      return [];
    }

    const loggedInUser = (process.env.INSTAGRAM_USER || '').toLowerCase().replace(/@/g, '');

    for (const term of searchTerms) {
      if (leads.length >= limit) break;

      const tag = term.replace(/^#/, '');
      
      const searchTerm = local ? `${tag} em ${local}` : tag;
      const searchUrl = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(searchTerm)}`;

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await sleep(DELAY_MS);

      // Aguardar o grid de posts/reels carregar (conteúdo dinâmico)
      await page.waitForSelector('a[href*="/p/"]', { timeout: 15000 }).catch(() => null);

      // Pegar links dos posts/reels no grid (href pode ser relativo /p/ ou absoluto)
      const reelUrls = await page.$$eval(
        'a[href*="/p/"]',
        (as) => {
          const seen = new Set();
          return as
            .map((a) => a.href)
            .filter((href) => {
              if (seen.has(href)) return false;
              if (href.includes('/reels/')) return false;
              // Só links de post/reel: instagram.com/.../p/CODIGO
              if (!/instagram\.com\/p\/[A-Za-z0-9_-]+\/?/.test(href)) return false;
              seen.add(href);
              return true;
            })
            .slice(0, 24);
        }
      );

      for (const reelUrl of reelUrls) {
        
        if (leads.length >= limit) break;

        try {
          await page.goto(reelUrl, { waitUntil: 'domcontentloaded' });
          await sleep(DELAY_MS);

          // Extrair autor do modal/página do reel (link no conteúdo do reel, não no nav)
          const username = await page.evaluate((exclude) => {
            const links = document.querySelectorAll('a[href^="/"][href$="/"]');
            const excludeLower = (exclude || '').toLowerCase();
            for (const a of links) {
              try {
                const path = new URL(a.href).pathname;
                const seg = path.replace(/^\/|\/$/g, '');
                if (!seg || seg.includes('/')) continue;
                if (/^(p|reel|reels|explore|stories|direct|accounts)$/.test(seg)) continue;
                if (excludeLower && seg.toLowerCase() === excludeLower) continue;
                const inNav = a.closest('nav') || a.closest('header');
                if (inNav && document.querySelector('main') && !document.querySelector('main').contains(a)) continue;
                return seg;
              } catch {
                continue;
              }
            }
            return null;
          }, loggedInUser);

          if (!username || seen.has(username)) continue;
          if (excludeInstagrams.has(username.toLowerCase())) continue;
          seen.add(username);

          const profileUrl = `https://www.instagram.com/${username}/`;
          await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
          await sleep(DELAY_MS);

          let seguidores = 0;
          let bio = '';
          // nome = username (ex: drmarcelferreira) - identificador correto do perfil
          const nome = username;

          // Seguidores do DOM (title tem valor exato: "497.557")
          const seguidoresFromDom = await page.evaluate(() => {
            const link = document.querySelector('a[href*="/followers/"]');
            if (!link) return null;
            const spanWithTitle = link.querySelector('span[title]');
            return spanWithTitle ? spanWithTitle.getAttribute('title') : null;
          });
          if (seguidoresFromDom) {
            seguidores = parseFollowersCount(seguidoresFromDom);
          }

          const metaDesc = await page.$('meta[name="description"]');
          if (metaDesc) {
            const content = await metaDesc.getAttribute('content') || '';
            bio = content;
            if (seguidores === 0) {
              const followersMatch = content.match(/([\d.,]+[KkMm]?)\s*Followers?/i)
                || content.match(/([\d.,]+(?:\s*(?:mil|milh[oã]e?s?))?)\s*seguidores?/i);
              if (followersMatch) seguidores = parseFollowersCount(followersMatch[1]);
            }
          }

          // Links da bio (telefone/WhatsApp pode estar em link abaixo do texto, não na meta)
          const bioLinks = await page.evaluate(() => {
            const hrefs = [];
            const main = document.querySelector('main');
            if (!main) return hrefs;
            main.querySelectorAll('a[href]').forEach((a) => {
              const h = a.href || '';
              if (/wa\.|whatsapp|wa\.link/i.test(h)) hrefs.push(h);
            });
            return hrefs;
          });

          const decodedLinks = bioLinks.map((h) => {
            try {
              return decodeURIComponent(h);
            } catch {
              return h;
            }
          });
          const bioComLinks = bio + ' ' + decodedLinks.join(' ');
          const hasWhatsApp = hasWhatsAppLink(bioComLinks);

          if (seguidores >= seguidores_minimos) {
            const telefone = hasWhatsApp ? extractPhoneFromWhatsAppLink(bioComLinks) : null;
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
          logger.debug({ err: e.message, reelUrl }, 'Error extracting profile from reel');
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
