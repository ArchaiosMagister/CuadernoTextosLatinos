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
  await expect(card).toContainText('1 texto');
  const backup=page.waitForEvent('download');
  await card.getByRole('button',{name:'Hacer copia'}).click();
  expect((await backup).suggestedFilename()).toMatch(/^copia-cuaderno-.*\.json$/);
  const cancelDialog=page.waitForEvent('dialog').then(dialog=>dialog.dismiss());
  await Promise.all([cancelDialog,card.getByRole('button',{name:'Eliminar'}).click()]);
  await expect(card).toBeVisible();
  let message='';
  const confirmDialog=page.waitForEvent('dialog').then(async dialog=>{
    message=dialog.message();await dialog.accept();
  });
  await Promise.all([confirmDialog,card.getByRole('button',{name:'Eliminar'}).click()]);
  expect(message).toContain('copia de seguridad');
  await expect(page.locator('.cuaderno-home-card')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Banco de textos propios'})).toBeVisible();
  await expect(page.locator('.cuaderno-home-bank')).toContainText('1 texto distinto');
  await page.locator('.cuaderno-home-bank .cuaderno-home-category').first()
    .locator('summary').first().click();
  await expect(page.locator('.cuaderno-home-bank')).toContainText('Pasaje para banco');
});


test('Banco propio: guarda y etiqueta un texto sin crear un cuaderno',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  const bank=page.locator('.cuaderno-home-bank');
  await bank.getByRole('button',{name:'Pegar en el banco'}).click();
  const modal=page.locator('.modal').last();
  await modal.getByRole('textbox',{name:'Título'}).fill('Texto sin cuaderno');
  await modal.getByRole('textbox',{name:'Autor'}).fill('César');
  await modal.getByRole('textbox',{name:'Texto latino'}).fill('Caesar exercitum ducit.');
  await modal.getByRole('button',{name:'Guardar en el banco'}).click();
  await expect(bank).toContainText('1 texto distinto');
  await bank.locator('.cuaderno-home-category').first().locator('summary').first().click();
  const source=bank.locator('.cuaderno-home-text').filter({hasText:'Texto sin cuaderno'}).first();
  await source.locator('summary').first().click();
  await source.getByRole('button',{name:'Etiquetar'}).click();
  const tagModal=page.locator('.modal').last();
  await tagModal.getByText('Añadir o quitar etiquetas manualmente',{exact:true}).click();
  await tagModal.locator('.cuaderno-bank-tag-option').filter({hasText:'Oración de relativo'})
    .getByRole('checkbox').check();
  await tagModal.getByRole('button',{name:'Guardar etiquetas'}).click();
  await expect(bank.locator('.cuaderno-home-category').filter({has:
    page.locator('summary').filter({hasText:'Oraciones y construcciones (1)'})}).first()).toBeVisible();
  const stored=await page.evaluate(async()=>{
    const {IndexedDbCorpusRepository}=await import('/storage/indexeddb-corpus-repository.js');
    const corpus=(await new IndexedDbCorpusRepository().load()).corpus;
    return corpus.texts.find(text=>text.title==='Texto sin cuaderno')?.tagIds??[];
  });
  expect(stored).toContain('gram.relativo');
  await expect(page.locator('.cuaderno-home-card')).toHaveCount(0);
});


test('Banco: Collatinus propone etiquetas pero sólo persisten las confirmadas',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  const bank=page.locator('.cuaderno-home-bank');
  await bank.getByRole('button',{name:'Pegar en el banco'}).click();
  const paste=page.locator('.modal').last();
  await paste.getByRole('textbox',{name:'Título'}).fill('Pasaje para etiquetado');
  await paste.getByRole('textbox',{name:'Texto latino'}).fill('Amatus est. Loquitur. Liber legendus.');
  await paste.getByRole('button',{name:'Guardar en el banco'}).click();
  await bank.locator('.cuaderno-home-category').first().locator('summary').first().click();
  const source=bank.locator('.cuaderno-home-text').filter({hasText:'Pasaje para etiquetado'}).first();
  await source.locator('summary').first().click();
  await source.getByRole('button',{name:'Etiquetar'}).click();
  const review=page.locator('.modal').last();
  await expect(review.getByText('Sin etiquetas confirmadas')).toBeVisible();
  await review.getByRole('button',{name:'Analizar con Collatinus'}).click();
  const candidate=review.locator('.grammar-proposal-card')
    .filter({has:review.getByText('Amatus est · Voz pasiva · Pendiente',{exact:true})}).first();
  await expect(candidate).toBeVisible();
  await candidate.locator('summary').first().click();
  await expect(candidate).toContainText('Requiere revisión sintáctica.');
  await candidate.getByText('Ver análisis y evidencia',{exact:true}).click();
  await expect(candidate).toContainText('formas adyacentes');
  // Analizar por sí solo no debe guardar etiquetas ni atribuir sintaxis automáticamente.
  const before=await page.evaluate(async()=>{
    const {IndexedDbCorpusRepository}=await import('/storage/indexeddb-corpus-repository.js');
    return (await new IndexedDbCorpusRepository().load()).corpus.texts
      .find(t=>t.title==='Pasaje para etiquetado')?.tagIds??[];
  });
  expect(before).toEqual([]);
  await candidate.getByRole('button',{name:'Aceptar',exact:true}).click();
  await expect(review.locator('.cuaderno-bank-current')).toContainText('Voz pasiva');
  await review.getByRole('button',{name:'Guardar etiquetas'}).click();
  const after=await page.evaluate(async()=>{
    const {IndexedDbCorpusRepository}=await import('/storage/indexeddb-corpus-repository.js');
    return (await new IndexedDbCorpusRepository().load()).corpus.texts
      .find(t=>t.title==='Pasaje para etiquetado')?.tagIds??[];
  });
  expect(after).toEqual(['gram.voz.pasiva']);
});
