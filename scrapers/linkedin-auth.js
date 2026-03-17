const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const STATE_PATH = process.env.LINKEDIN_STATE_PATH || path.join(process.cwd(), '.linkedin-state.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Carrega cookies salvos do disco (se existirem)
 * @returns {object[]|null} Array de cookies ou null
 */
function loadSavedState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      if (data.cookies && Array.isArray(data.cookies) && data.cookies.length > 0) {
        return data.cookies;
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to load LinkedIn state');
  }
  return null;
}

/**
 * Salva cookies no disco para reutilizar em execuções futuras
 * @param {object[]} cookies
 */
function saveState(cookies) {
  try {
    const dir = path.dirname(STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_PATH, JSON.stringify({ cookies, savedAt: new Date().toISOString() }), 'utf8');
    logger.info('LinkedIn session saved');
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to save LinkedIn state');
  }
}

/**
 * Faz login no LinkedIn via formulário
 * @param {import('playwright').Page} page
 */
async function doLogin(page) {
  const user = process.env.LINKEDIN_USER;
  const pass = process.env.LINKEDIN_PASSWORD;

  if (!user || !pass) {
    throw new Error('LINKEDIN_USER e LINKEDIN_PASSWORD devem estar definidos no .env para login');
  }

  logger.info('Logging in to LinkedIn...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  const usernameInput = page.locator('input[name="session_key"]').first();
  const passwordInput = page.locator('input[name="session_password"]').first();

  await usernameInput.fill(user, { timeout: 5000 });
  await passwordInput.fill(pass, { timeout: 5000 });
  await sleep(500);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
  await submitBtn.click();
  await sleep(5000);

  if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
    throw new Error('Login falhou - verifique LINKEDIN_USER e LINKEDIN_PASSWORD. Desative 2FA na conta de teste.');
  }

  logger.info('LinkedIn login successful');
}

/**
 * Garante que o context está autenticado. Carrega estado salvo ou faz login.
 * @param {import('playwright').BrowserContext} context
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>} true se autenticado
 */
async function ensureAuthenticated(context, page) {
  const cookies = loadSavedState();

  if (cookies && cookies.length > 0) {
    await context.addCookies(cookies);
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
      logger.info('Saved session expired, re-logging in...');
      await doLogin(page);
      saveState(await context.cookies());
      return true;
    }
    logger.info('Using saved LinkedIn session');
    return true;
  }

  await doLogin(page);
  saveState(await context.cookies());
  return true;
}

module.exports = {
  loadSavedState,
  saveState,
  doLogin,
  ensureAuthenticated,
  STATE_PATH,
};
