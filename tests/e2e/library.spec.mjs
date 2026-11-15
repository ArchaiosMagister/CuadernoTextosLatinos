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
  await expect(page.getByText('Nuevo texto')).toBeVisible();
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

test('la biblioteca completa está disponible tras desconectarse de internet', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#phase2-status')).toContainText('Biblioteca cargada');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.locator('.offline-indicator')).toContainText('preparada sin conexión');
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('#phase2-status')).toContainText('Biblioteca cargada');
  await page.getByRole('combobox',{name:'Filtrar por autor'}).selectOption('Eutropio');
  await page.locator('.lib-sidebar .work-row').first().click();
  await expect(page.locator('.reader-line').first()).toBeVisible();
  await page.getByRole('combobox',{name:'Filtrar por autor'}).selectOption('Cornelio Nepote');
  await page.locator('.lib-sidebar .work-row').first().click();
  await expect(page.locator('.reader-line').first()).toBeVisible();
});
