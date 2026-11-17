import {test,expect} from '@playwright/test';

test('biblioteca Examinator2: autor, género, obras offline y lectura en dos paneles',async({page})=>{
  await page.setViewportSize({width:820,height:1180});
  await page.goto('/?nuevo=1');
  page.once('dialog',d=>d.accept('Cuaderno Biblioteca'));
  await page.getByRole('button',{name:'+ Crear cuaderno'}).click();
  await expect(page.locator('.exlib')).toBeVisible();
  await expect(page.locator('.exlib-catalog')).toBeVisible();
  await expect(page.locator('.exlib-reading')).toBeVisible();
  const search=page.getByRole('searchbox',{name:'Autor u obra'});
  await search.fill('Eutropio');
  await expect(page.locator('.exlib-list .exlib-row.available')).toHaveCount(1);
  await expect(page.locator('.exlib-list')).toContainText('Eutropio');
  await search.fill('');
  await page.getByRole('combobox',{name:'Todos los géneros'}).selectOption({label:'Biografía'});
  await expect(page.locator('.exlib-list')).toContainText('Cornelio Nepote');
  await page.getByRole('combobox',{name:'Todos los géneros'}).selectOption('');
  await search.fill('Julio César');
  await page.locator('.exlib-row.available .exlib-item').first().click();
  await expect(page.locator('.exlib-reader-lines .simple-reader-line').first()).toBeVisible();
  await page.getByRole('textbox',{name:'Ir a referencia'}).fill('1.1');
  await page.getByRole('button',{name:'Ir a',exact:true}).click();
  await page.locator('.exlib-reader-lines .simple-reader-line').first().click();
  await expect(page.getByRole('button',{name:'Usar la selección'})).toBeEnabled();
  await page.getByRole('button',{name:'Usar la selección'}).click();
  await expect(page.locator('.edition-counter')).toHaveText('Texto 1 de 1');
  await page.getByRole('button',{name:'+ NUEVO'}).click();
  await page.getByRole('button',{name:'Volver al cuaderno'}).first().click();
  await expect(page.locator('.edition-counter')).toHaveText('Texto 1 de 1');
});

test('obras Perseus: descargar al navegador, reabrir sin red y conservar los cuadernos',async({page})=>{
  await page.route('https://raw.githubusercontent.com/PerseusDL/canonical-latinLit/**',route=>
    route.fulfill({status:200,contentType:'application/xml',body:`<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><div type="edition">
<div type="textpart" subtype="book" n="1"><div type="textpart" subtype="chapter" n="1">
<p>Arma virumque cano, Troiae qui primus ab oris.</p>
<p>Italiam fato profugus Laviniaque venit.</p>
</div></div></div></body></text></TEI>`}));
  await page.goto('/?nuevo=1');
  page.once('dialog',d=>d.accept('Catálogo completo'));
  await page.getByRole('button',{name:'+ Crear cuaderno'}).click();
  const remote=page.locator('.exlib-list .exlib-row:not(.available)').first();
  await expect(remote).toBeVisible();
  const name=await remote.locator('.exlib-item strong').innerText();
  await remote.locator('input[type=checkbox]').check();
  await page.getByRole('button',{name:'Descargar las marcadas'}).click();
  await expect(page.locator('.exlib-progress')).toContainText('Descarga terminada');
  const ready=page.locator('.exlib-list .exlib-row.available').filter({hasText:name}).first();
  await expect(ready).toBeVisible();
  await ready.locator('.exlib-item').click();
  await expect(page.locator('.exlib-reader-lines')).toContainText('Arma virumque cano');
  await page.reload();
  await page.getByRole('button',{name:'Abrir',exact:true}).click();
  await expect(page.locator('.notebook-editor-head')).toContainText('0 textos');
  await page.getByRole('button',{name:'Buscar autores'}).click();
  const cached=page.locator('.exlib-list .exlib-row.available').filter({hasText:name}).first();
  await expect(cached).toBeVisible();
  await cached.locator('.exlib-item').click();
  await page.locator('.exlib-reader-lines .simple-reader-line').first().click();
  await page.getByRole('button',{name:'Usar la selección'}).click();
  await expect(page.locator('.edition-counter')).toHaveText('Texto 1 de 1');
});
