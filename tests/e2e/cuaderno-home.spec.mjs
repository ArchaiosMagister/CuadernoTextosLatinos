import {test,expect} from '@playwright/test';

test('Inicio: tarjetas y banco visibles sin desplegable ni hoja A4 vacía en iPhone e iPad',async({page})=>{
  for(const width of [390,820]){
    await page.setViewportSize({width,height:844});
    await page.goto('/examinator-cuadernos/');
    await expect(page.getByRole('heading',{name:'Mis cuadernos'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Banco de textos propios'})).toBeVisible();
    await expect(page.getByRole('combobox',{name:'Elegir cuaderno',exact:true})).toHaveCount(0);
    await expect(page.locator('#preview')).toBeHidden();
    await expect(page.getByRole('button',{name:'Nuevo cuaderno'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Importar cuaderno'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  }
});

test('Tarjetas: crear, volver, copia voluntaria, cancelación y borrado con una confirmación',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  page.once('dialog',d=>d.accept('Cuaderno en tarjetas'));
  await page.getByRole('button',{name:'Nuevo cuaderno'}).click();
  await expect(page.getByRole('button',{name:'Volver a mis cuadernos'})).toBeVisible();
  await page.getByRole('button',{name:'Pegar texto',exact:true}).click();
  const modal=page.locator('.modal').last();
  await modal.getByRole('textbox',{name:'Título'}).fill('Pasaje para banco');
  await modal.getByRole('textbox',{name:'Texto latino'}).fill('Caesar Galliam vicit.');
  await modal.getByRole('button',{name:'Añadir al cuaderno'}).click();
  await expect(page.locator('.edition-counter')).toContainText('Texto 1 de 1');
  await page.getByRole('button',{name:'Volver a mis cuadernos'}).click();
  const card=page.locator('.cuaderno-home-card').filter({hasText:'Cuaderno en tarjetas'});
  await expect(card).toBeVisible();
  await expect(card).toContainText('1 textos');
  const backup=page.waitForEvent('download');
  await card.getByRole('button',{name:'Hacer copia'}).click();
  expect((await backup).suggestedFilename()).toMatch(/^copia-cuaderno-.*\.json$/);
  const cancelDialog=page.waitForEvent('dialog');
  await card.getByRole('button',{name:'Eliminar'}).click();
  await (await cancelDialog).dismiss();
  await expect(card).toBeVisible();
  const confirmDialog=page.waitForEvent('dialog');
  await card.getByRole('button',{name:'Eliminar'}).click();
  const dialog=await confirmDialog;
  expect(dialog.message()).toContain('copia de seguridad');
  await dialog.accept();
  await expect(page.locator('.cuaderno-home-card')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Banco de textos propios'})).toBeVisible();
  await expect(page.locator('.cuaderno-home-bank')).toContainText('Pasaje para banco');
});
