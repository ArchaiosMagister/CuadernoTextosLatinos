import {test,expect} from '@playwright/test';

test('Collatinus propone una pasiva y guarda únicamente la selección confirmada',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  await expect(page.getByRole('combobox',{name:'Elegir cuaderno',exact:true})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept('Revisión latina'));
  await page.locator('#btnNew').click();
  await page.getByRole('button',{name:'Pegar texto',exact:true}).click();
  const modal=page.locator('.modal').last();
  await modal.getByRole('textbox',{name:'Texto latino'}).fill('Amatus est. Loquitur. Liber legendus.');
  await modal.getByRole('button',{name:'Añadir al cuaderno'}).click();
  await expect(page.locator('.edition-counter')).toContainText('Texto 1 de 1');
  await page.getByRole('button',{name:'Etiquetas gramaticales',exact:true}).click();
  await modal.getByRole('button',{name:'Analizar etiquetas con Collatinus'}).click();
  const candidate=modal.locator('details').filter({has:page.getByText('Amatus est · Voz pasiva · Pendiente',{exact:true})});
  await candidate.locator('summary').click();
  await expect(candidate).toContainText('formas adyacentes');
  await expect(candidate).toContainText('Requiere revisión sintáctica.');
  await expect(modal.getByText('Etiquetar fragmentos del texto (0)',{exact:true})).toBeVisible();
  await candidate.getByRole('button',{name:'Aceptar',exact:true}).click();
  await expect(modal.getByText('Amatus est · Voz pasiva · Confirmada',{exact:true})).toBeVisible();
  await expect(modal.getByText('Etiquetar fragmentos del texto (1)',{exact:true})).toBeVisible();
  await expect(modal.getByText('Loquitur · Voz pasiva',{exact:false})).toHaveCount(0);
  await expect(modal.getByText('legendus · Gerundivo',{exact:false})).toHaveCount(0);
});

test('copia individual conserva las etiquetas y la restauración repetida conserva una sola copia',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  const selector=page.getByRole('combobox',{name:'Elegir cuaderno',exact:true});
  await expect(selector).toBeVisible();
  page.once('dialog',dialog=>dialog.accept('Cuaderno de respaldo'));
  await page.locator('#btnNew').click();
  await page.getByRole('button',{name:'Pegar texto',exact:true}).click();
  const modal=page.locator('.modal').last();
  await modal.getByRole('textbox',{name:'Texto latino'}).fill('Amatus est.');
  await modal.getByRole('button',{name:'Añadir al cuaderno'}).click();
  await expect(page.locator('.edition-counter')).toContainText('Texto 1 de 1');
  await page.getByRole('button',{name:'Etiquetas gramaticales',exact:true}).click();
  await modal.getByText('Etiquetar fragmentos del texto (0)',{exact:true}).click();
  await modal.getByRole('combobox',{name:'Construcción del fragmento'}).selectOption('gram.voz.pasiva');
  await modal.getByRole('textbox',{name:'Seleccionar fragmento latino'}).evaluate(area=>area.setSelectionRange(0,10));
  await modal.getByRole('button',{name:'Etiquetar selección'}).click();
  await expect(modal.getByText('Etiquetar fragmentos del texto (1)',{exact:true})).toBeVisible();
  await modal.getByRole('button',{name:'Cerrar'}).click();
  await page.getByText('Copias de seguridad',{exact:true}).click();
  const [download]=await Promise.all([
    page.waitForEvent('download'),page.getByRole('button',{name:'Copia del cuaderno',exact:true}).click(),
  ]);
  const path=await download.path();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#editor .card input[type=file]').setInputFiles(path);
  await expect(selector.locator('option')).toHaveCount(3);
  await page.locator('#editor .card input[type=file]').setInputFiles(path);
  await expect(page.getByText('Esta copia ya se había importado.',{exact:true})).toBeVisible();
  await expect(selector.locator('option')).toHaveCount(3);
  await page.getByRole('button',{name:'Etiquetas gramaticales',exact:true}).click();
  await expect(modal.getByText('Etiquetar fragmentos del texto (1)',{exact:true})).toBeVisible();
});
