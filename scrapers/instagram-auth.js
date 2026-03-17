const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const STATE_PATH = process.env.INSTAGRAM_STATE_PATH || path.join(process.cwd(), '.instagram-state.json');

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
    logger.warn({ err: err.message }, 'Failed to load Instagram state');
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
    logger.info('Instagram session saved');
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to save Instagram state');
  }
}

/**
 * Faz login no Instagram via formulário
 * @param {import('playwright').Page} page
 */
async function doLogin(page) {
  const user = process.env.INSTAGRAM_USER;
  const pass = process.env.INSTAGRAM_PASSWORD;

  if (!user || !pass) {
    throw new Error('INSTAGRAM_USER e INSTAGRAM_PASSWORD devem estar definidos no .env para login');
  }

  logger.info('Logging in to Instagram...');
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  const usernameInput = page.locator('input[name="email"]').first();
  const passwordInput = page.locator('input[name="pass"]').first();

  await usernameInput.fill(user, { timeout: 5000 });
  await passwordInput.fill(pass, { timeout: 5000 });
  await sleep(500);

  // Botão "Entrar" / "Log in" - tenta por texto primeiro, depois type=submit
  const submitBtn =
    page.getByRole('button', { name: /entrar|log in|sign in/i }).first().or(
      page.locator('button[type="submit"]').first()
    );
  await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
  await submitBtn.click();
  await sleep(5000);

  if (page.url().includes('/accounts/login') || page.url().includes('/challenge')) {
    throw new Error('Login falhou - verifique INSTAGRAM_USER e INSTAGRAM_PASSWORD. Desative 2FA na conta de teste.');
  }

  await sleep(2000);

  const notNowBtn = page.getByRole('button', { name: /not now|agora não/i }).first();
  if (await notNowBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await notNowBtn.click();
    await sleep(1500);
  }

  const saveInfoNotNow = page.getByText(/not now|agora não/i).first();
  if (await saveInfoNotNow.isVisible({ timeout: 2000 }).catch(() => false)) {
    await saveInfoNotNow.click();
    await sleep(1000);
  }

  logger.info('Instagram login successful');
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
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    if (page.url().includes('/accounts/login') || page.url().includes('/challenge')) {
      logger.info('Saved session expired, re-logging in...');
      await doLogin(page);
      saveState(await context.cookies());
      return true;
    }
    logger.info('Using saved Instagram session');
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
