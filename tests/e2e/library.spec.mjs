import { test, expect } from '@playwright/test';

test('biblioteca Examinator: buscar, elegir pasajes y guardarlos en un cuaderno', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#phase2-status')).toContainText('Biblioteca cargada');
  const author = page.getByRole('combobox', { name: 'Filtrar por autor' });
  await author.selectOption('Julio César');
  await expect(page.locator('.lib-sidebar .work-row')).toHaveCount(2);
  await page.locator('.lib-sidebar .work-row').filter({hasText:'De bello Gallico'}).click();
  await expect(page.locator('.lib-reader .reader-work')).toContainText('De bello Gallico');

  await page.locator('.reader-line').first().click();
  await page.locator('.reader-line').nth(1).click();
  await expect(page.locator('.selection-description')).toContainText('palabras');
  await page.getByRole('button', { name: 'Añadir selección a mis textos' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo texto' })).toBeVisible();
  const latin = await page.locator('.editor-form textarea').inputValue();
  expect(latin.split(/\s+/).length).toBeGreaterThan(6);
  await page.getByRole('button', { name: 'Guardar texto' }).click();
  await expect(page.locator('#phase2-status')).toContainText('Cambios guardados');

  await page.getByRole('button',{name:'Cuadernos'}).click();
  await page.getByPlaceholder('Nombre del cuaderno').fill('Cuaderno de prueba');
  await page.getByRole('button',{name:'Crear cuaderno'}).click();
  await page.getByRole('button',{name:'Añadir texto'}).click();
  await expect(page.locator('.notebook-contents li')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#phase2-status')).toContainText('Biblioteca cargada');
  await page.getByRole('button',{name:'Mis textos'}).click();
  await expect(page.locator('.lib-sidebar .work-row')).toHaveCount(1);
  await page.getByRole('button',{name:'Cuadernos'}).click();
  await expect(page.locator('.notebook-contents li')).toHaveCount(1);
});

test('tres autores y navegación por cita', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#phase2-status')).toContainText('Biblioteca cargada');
  const author=page.getByRole('combobox',{name:'Filtrar por autor'});
  await author.selectOption('Cornelio Nepote');
  await expect(page.locator('.lib-sidebar .work-row')).toHaveCount(25);
  await page.locator('.lib-sidebar .work-row').filter({hasText:'Miltiades'}).first().click();
  await expect(page.locator('.lib-reader .reader-work')).toContainText('Miltiades');
  await page.getByRole('textbox',{name:'Ir a pasaje'}).fill('2.1');
  await page.getByRole('button',{name:'Ir a',exact:true}).click();
  await expect(page.locator('.reader-line[data-c="2.1"]')).toHaveCount(1);

  await author.selectOption('Eutropio');
  await expect(page.locator('.lib-sidebar .work-row')).toHaveCount(1);
  await page.locator('.lib-sidebar .work-row').first().click();
  await expect(page.locator('.lib-reader .reader-work')).toContainText('Breviarium');
});

test('la caché offline incluye realmente las 28 obras completas y el arranque', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#phase2-status')).toContainText('Biblioteca cargada');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect(page.locator('.offline-indicator')).toContainText('preparada sin conexión');
  // WebKit CI no permite comprobar una navegación offline real con el Inspector:
  // setOffline interrumpe el navegador antes de que responda el Service Worker.
  // Sí podemos verificar que los archivos están almacenados, íntegros y accesibles
  // mediante la CacheStorage del navegador SIN utilizar la red.
  await page.context().setOffline(true);
  const result = await page.evaluate(async () => {
    const base = new URL('./', document.location.href);
    const catalogResponse = await caches.match(new URL('library/catalog.json', base));
    if (!catalogResponse) return { error: 'Catálogo no encontrado en caché' };
    const catalog = await catalogResponse.json();
    const authors = new Set();
    let checked = 0;
    for (const entry of catalog.works) {
      const response = await caches.match(new URL('library/' + entry.file, base));
      if (!response) return { error: 'Falta en caché ' + entry.file };
      const work = await response.json();
      if (work.urn !== entry.urn || !work.lines.length) {
        return { error: 'Contenido incompatible: ' + entry.file };
      }
      authors.add(work.author);
      checked++;
    }
    const shell = await caches.match(new URL('index.html', base));
    return { checked, authors:[...authors].sort(), shell:Boolean(shell) };
  });
  expect(result).toEqual({
    checked: 28,
    authors: ['Cornelio Nepote','Eutropio','Julio César'],
    shell: true,
  });
});
