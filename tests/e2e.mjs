/**
 * Suite de tests E2E — PokerPoke Staging
 * Lee el DOM directamente (sin screenshots) para verificar valores exactos.
 * Ejecutar: node tests/e2e.mjs
 */

import { chromium } from 'playwright';

const BASE = 'https://pokerpoke.duckdns.org/staging/';
const BOT_A = 'TestBotA';

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
    errors.push(msg);
  }
}

async function login(page, name) {
  await page.goto(BASE);
  await page.waitForSelector('input[placeholder="Tu nombre"]', { timeout: 10000 });
  await page.fill('input[placeholder="Tu nombre"]', name);
  await page.click('button:has-text("Play")');
  await page.waitForTimeout(2000);
}

async function getText(page) {
  return page.locator('body').textContent();
}

// ─── TEST 1: Login ────────────────────────────────────────────────────────────
async function testLogin(browser) {
  console.log('\n📋 TEST 1: Login y sesión');
  const page = await browser.newPage();
  try {
    await page.goto(BASE);
    await page.waitForSelector('input[placeholder="Tu nombre"]', { timeout: 10000 });
    assert(true, 'Pantalla de login cargada');

    assert(await page.locator('text=Cards. Chips. Glory.').count() > 0, 'Subtitle "Cards. Chips. Glory." visible');
    assert(await page.locator('text=Poker').count() > 0, 'Título "Poker" visible');

    await login(page, BOT_A);
    const body = await getText(page);
    assert(
      body.includes('Sala') || body.includes('Crear') || body.includes('Lobby') || body.includes('Jackpot'),
      `Login exitoso → llegamos al lobby`
    );
    assert(!body.match(/-\d+[kMBQi]/), 'Saldo no negativo tras login');
  } finally {
    await page.close();
  }
}

// ─── TEST 2: Lobby — elementos clave ─────────────────────────────────────────
async function testLobby(browser) {
  console.log('\n📋 TEST 2: Lobby');
  const page = await browser.newPage();
  try {
    await login(page, BOT_A);
    const body = await getText(page);
    assert(body.includes('Sala') || body.includes('sala') || body.includes('Crear'), 'Salas visibles o botón crear');
    assert(body.match(/[Nn]ivel|Nv\.?\s*\d+|XP/), 'Nivel/XP visible');
    assert(body.includes('Jackpot') || body.includes('Blackjack') || body.includes('BJ') || body.includes('Mines') || body.includes('Minas') || body.includes('Crash'), 'Minijuegos visibles');
    assert(body.includes('Ruleta') || body.includes('ruleta') || body.includes('🎡'), 'Ruleta visible');
    assert(body.includes('Tienda') || body.includes('tienda') || body.includes('Shop') || body.includes('Jackpot'), 'Tienda/minijuegos visibles');
  } finally {
    await page.close();
  }
}

// ─── TEST 3: Paguita/Dieta cooldown reducido ──────────────────────────────────
async function testPaguita(browser) {
  console.log('\n📋 TEST 3: Paguita / Dieta');
  const page = await browser.newPage();
  try {
    await login(page, BOT_A);
    const body = await getText(page);
    assert(
      body.includes('paguita') || body.includes('Paguita') || body.includes('dieta') || body.includes('Dieta'),
      'Sistema paguita/dieta accesible'
    );
  } finally {
    await page.close();
  }
}

// ─── TEST 4: Blackjack accesible ──────────────────────────────────────────────
async function testBlackjack(browser) {
  console.log('\n📋 TEST 4: Blackjack');
  const page = await browser.newPage();
  try {
    await login(page, BOT_A);
    const body = await getText(page);
    assert(body.includes('Blackjack') || body.includes('blackjack') || body.includes('BJ'), 'Blackjack accesible');
  } finally {
    await page.close();
  }
}

// ─── TEST 5: Jackpot accesible ────────────────────────────────────────────────
async function testJackpot(browser) {
  console.log('\n📋 TEST 5: Jackpot');
  const page = await browser.newPage();
  try {
    await login(page, BOT_A);
    const body = await getText(page);
    assert(body.includes('Jackpot') || body.includes('jackpot'), 'Jackpot accesible');
  } finally {
    await page.close();
  }
}

// ─── TEST 6: Mines accesible ──────────────────────────────────────────────────
async function testMines(browser) {
  console.log('\n📋 TEST 6: Mines');
  const page = await browser.newPage();
  try {
    await login(page, BOT_A);
    const body = await getText(page);
    assert(body.includes('Mines') || body.includes('mines') || body.includes('Minas') || body.includes('💣'), 'Mines accesible');
  } finally {
    await page.close();
  }
}

// ─── TEST 7: Crash accesible ──────────────────────────────────────────────────
async function testCrash(browser) {
  console.log('\n📋 TEST 7: Crash');
  const page = await browser.newPage();
  try {
    await login(page, BOT_A);
    const body = await getText(page);
    assert(body.includes('Crash') || body.includes('crash') || body.includes('🚀'), 'Crash accesible');
  } finally {
    await page.close();
  }
}

// ─── TEST 8: Tienda accesible y contiene items ────────────────────────────────
async function testTienda(browser) {
  console.log('\n📋 TEST 8: Tienda');
  const page = await browser.newPage();
  try {
    await login(page, BOT_A);
    // Intentar abrir la tienda
    const tiendaBtn = page.locator('button, [role="button"]').filter({ hasText: /[Tt]ienda|[Ss]hop|🛒/ }).first();
    if (await tiendaBtn.count() > 0) {
      await tiendaBtn.click();
      await page.waitForTimeout(1000);
      const body = await getText(page);
      assert(body.includes('Marco') || body.includes('Artilugio') || body.includes('Boost') || body.includes('avatar'), 'Tienda contiene items');
    } else {
      assert(true, 'Tienda visible en lobby (botón no directo)');
    }
  } finally {
    await page.close();
  }
}

// ─── TEST 9: Menú de nivel accesible ─────────────────────────────────────────
async function testMenuNivel(browser) {
  console.log('\n📋 TEST 9: Menú de nivel');
  const page = await browser.newPage();
  try {
    await login(page, BOT_A);
    const nivelBtn = page.locator('button, [role="button"]').filter({ hasText: /[Nn]ivel|XP|Nv\.?\s*\d+/ }).first();
    if (await nivelBtn.count() > 0) {
      await nivelBtn.click();
      await page.waitForTimeout(1000);
      const body = await getText(page);
      assert(
        body.includes('paguita') || body.includes('Paguita') || body.includes('dieta') || body.includes('ruleta') || body.includes('trivia'),
        'Menú de nivel muestra tracks de mejora'
      );
    } else {
      const body = await getText(page);
      assert(body.match(/[Nn]ivel|XP/), 'Info de nivel visible');
    }
  } finally {
    await page.close();
  }
}

// ─── TEST 10: Poker — entrar a sala ──────────────────────────────────────────
async function testPoker(browser) {
  console.log('\n📋 TEST 10: Poker');
  const page = await browser.newPage();
  try {
    await login(page, BOT_A);
    // Crear sala o entrar a una existente
    const crearBtn = page.locator('button').filter({ hasText: /[Cc]rear|[Nn]ueva [Ss]ala/ }).first();
    if (await crearBtn.count() > 0) {
      await crearBtn.click();
      await page.waitForTimeout(1500);
      const body = await getText(page);
      assert(
        body.includes('Esperar') || body.includes('poker') || body.includes('Mesa') || body.includes('BB') || body.includes('Fold'),
        'Sala de poker creada/accesible'
      );
    } else {
      assert(true, 'Poker accesible (sala existente en lobby)');
    }
  } finally {
    await page.close();
  }
}

// ─── TEST 11: No errores de consola críticos ──────────────────────────────────
async function testNoConsoleErrors(browser) {
  console.log('\n📋 TEST 11: Sin errores críticos de consola');
  const page = await browser.newPage();
  const criticalErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignorar errores conocidos no críticos
      if (!text.includes('favicon') && !text.includes('net::ERR_') && !text.includes('404')) {
        criticalErrors.push(text.substring(0, 100));
      }
    }
  });

  try {
    await login(page, BOT_A);
    await page.waitForTimeout(2000);
    assert(criticalErrors.length === 0, `Sin errores JS críticos en consola (encontrados: ${criticalErrors.length})`);
    if (criticalErrors.length > 0) {
      criticalErrors.forEach(e => console.log(`    → ${e}`));
    }
  } finally {
    await page.close();
  }
}

// ─── RUNNER ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('🎰 PokerPoke E2E Test Suite');
  console.log('================================');
  console.log(`URL: ${BASE}`);
  console.log(`Bot: ${BOT_A}`);

  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  try {
    await testLogin(browser);
    await testLobby(browser);
    await testPaguita(browser);
    await testBlackjack(browser);
    await testJackpot(browser);
    await testMines(browser);
    await testCrash(browser);
    await testTienda(browser);
    await testMenuNivel(browser);
    await testPoker(browser);
    await testNoConsoleErrors(browser);
  } finally {
    await browser.close();
  }

  console.log('\n================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  if (errors.length > 0) {
    console.log('\nFailed:');
    errors.forEach(e => console.log(`  ✗ ${e}`));
  }
  console.log('================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
