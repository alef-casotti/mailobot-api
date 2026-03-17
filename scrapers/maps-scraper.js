const { chromium } = require('playwright');
const { extractInstagramHandle, hasWhatsAppLink, extractPhoneFromWhatsAppLink, parseFollowersCount, normalizePhone } = require('../utils/helpers');
const logger = require('../utils/logger');

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const DELAY_MS = parseInt(process.env.SCRAPER_DELAY_MS, 10) || 2000;
const TIMEOUT_MS = parseInt(process.env.SCRAPER_TIMEOUT_MS, 10) || 30000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Pesquisa no Google Maps e extrai negócios com Instagram ou telefone
 * @param {string} query - Ex: "barbearias Niterói"
 * @param {number} limit - Máximo de resultados
 * @returns {Promise<Array<{nome, endereco, instagram, site, telefone}>>}
 */
async function searchGoogleMaps(query, limit = 20) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  const results = [];
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);

    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded' });
    await sleep(DELAY_MS);

    const panelSelector = 'div[role="feed"]';
    await page.waitForSelector(panelSelector, { timeout: 10000 }).catch(() => null);

    const items = await page.$$('a[href*="/maps/place/"]');
    const seen = new Set();
    let count = 0;

    for (const item of items) {
      if (count >= limit) break;
      try {
        const href = await item.getAttribute('href');
        if (!href || seen.has(href)) continue;
        seen.add(href);

        await item.click();
        await sleep(1500);

        let nameEl = await page.$('h1.DUwDvf.lfPIob') || await page.$('h1');
        let name = nameEl ? (await nameEl.textContent()).trim() : '';
        if (name === 'Resultados') {
          const allH1s = await page.$$('h1');
          if (allH1s.length > 1) {
            name = (await allH1s[1].textContent()).trim();
          }
        }

        const addressEl = await page.$('[data-item-id="address"]');
        const endereco = addressEl ? (await addressEl.textContent()).trim() : '';

        let telefone = null;
        const telLink = await page.$('a[href^="tel:"]');
        if (telLink) {
          const href = await telLink.getAttribute('href');
          if (href) {
            const num = href.replace(/^tel:/i, '').replace(/\D/g, '');
            if (num.length >= 10) telefone = num;
          }
        }
        if (!telefone) {
          const phoneBtn = await page.$('button[data-item-id^="phone:"]');
          if (phoneBtn) {
            const dataId = await phoneBtn.getAttribute('data-item-id');
            const match = dataId && dataId.match(/tel:(\d+)/);
            if (match && match[1].length >= 10) telefone = match[1];
          }
        }

        const links = await page.$$eval('a[href]', (as) =>
          as.map((a) => ({ href: a.href, text: a.textContent?.trim() || '' }))
        );

        let instagram = null;
        let site = null;
        for (const l of links) {
          if (l.href.includes('instagram.com')) {
            instagram = extractInstagramHandle(l.href);
            break;
          }
          if (l.href && !l.href.startsWith('javascript') && !l.href.includes('google.com') && l.text && l.text.length > 3) {
            site = site || l.href;
          }
        }

        if (name && (instagram || telefone)) {
          results.push({ nome: name, endereco, instagram, site, telefone });
          count++;
        }
      } catch (e) {
        logger.debug({ err: e.message }, 'Error extracting business');
      }
    }

    await browser.close();
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }

  return results;
}

/**
 * Abre perfil do Instagram e verifica seguidores + link WhatsApp na bio
 * @param {string} username
 * @returns {Promise<{seguidores: number, bio: string, hasWhatsApp: boolean}>}
 */
async function getInstagramProfileInfo(username) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);

    const url = `https://www.instagram.com/${username}/`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(DELAY_MS);

    let seguidores = 0;
    let bio = '';

    const metaDesc = await page.$('meta[name="description"]');
    if (metaDesc) {
      const content = await metaDesc.getAttribute('content') || '';
      const followersMatch = content.match(/([\d.,]+[KkMm]?)\s*Followers?/i) || content.match(/([\d.,]+)\s*seguidores?/i);
      if (followersMatch) seguidores = parseFollowersCount(followersMatch[1]);
      bio = content;
    }

    const hasWhatsApp = hasWhatsAppLink(bio);

    await browser.close();
    return { seguidores, bio, hasWhatsApp };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

/**
 * Fluxo completo: Maps -> Instagram -> leads qualificados
 * @param {object} options - { query, cidade_alvo, palavras_chave, seguidores_minimos, limit, excludeIdentifiers }
 */
async function discoverLocalBusinessLeads(options) {
  const {
    query,
    cidade_alvo,
    palavras_chave = [],
    seguidores_minimos = 0,
    limit = 10,
    excludeIdentifiers = {},
  } = options;

  const excludeInstagrams = excludeIdentifiers.instagrams || new Set();
  const excludeTelefones = excludeIdentifiers.telefones || new Set();

  const searchQuery = query || [cidade_alvo, ...palavras_chave].filter(Boolean).join(' ');
  if (!searchQuery.trim()) {
    throw new Error('Query or cidade_alvo + palavras_chave required');
  }

  const businesses = await searchGoogleMaps(searchQuery, Math.min(limit * 5, 50));
  const leads = [];

  for (const biz of businesses) {
    if (leads.length >= limit) break;
    if (seguidores_minimos > 0 && !biz.instagram) continue;

    if (biz.instagram && excludeInstagrams.has(biz.instagram.toLowerCase())) continue;
    if (biz.telefone && excludeTelefones.has(normalizePhone(biz.telefone))) continue;

    if (seguidores_minimos === 0) {
      if (!biz.instagram && !biz.telefone) continue;
      leads.push({
        nome: biz.nome,
        instagram: biz.instagram || null,
        seguidores: 0,
        cidade: cidade_alvo || biz.endereco,
        origem: 'google_maps',
        telefone: biz.telefone || null,
      });
      continue;
    }

    try {
      const profile = await getInstagramProfileInfo(biz.instagram);
      const meetsFollowers = profile.seguidores >= seguidores_minimos;
      const meetsWhatsApp = profile.hasWhatsApp;

      if (meetsFollowers && meetsWhatsApp) {
        const telefone = extractPhoneFromWhatsAppLink(profile.bio) || biz.telefone || null;
        leads.push({
          nome: biz.nome,
          instagram: biz.instagram,
          seguidores: profile.seguidores,
          cidade: cidade_alvo || biz.endereco,
          origem: 'google_maps',
          telefone,
        });
      }
      await sleep(DELAY_MS);
    } catch (err) {
      logger.warn({ instagram: biz.instagram, err: err.message }, 'Instagram profile fetch failed');
    }
  }

  return leads;
}

module.exports = {
  searchGoogleMaps,
  getInstagramProfileInfo,
  discoverLocalBusinessLeads,
};
