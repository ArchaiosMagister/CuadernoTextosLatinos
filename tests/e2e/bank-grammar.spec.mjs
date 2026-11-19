import {test,expect} from '@playwright/test';

test('Banco propio: etiqueta confirmada y reutilizable sin cuaderno abierto',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/examinator-cuadernos/');
  await page.getByRole('button',{name:'Pegar texto al banco'}).click();
  let modal=page.locator('.modal').last();
  await modal.getByRole('textbox',{name:'Título'}).fill('Pasiva propia');
  await modal.getByRole('textbox',{name:'Texto latino'}).fill('Amatus est. Loquitur.');
  await modal.getByRole('button',{name:'Guardar en el banco'}).click();
  await page.locator('.cuaderno-home-category').first().locator('summary').first().click();
  await page.getByRole('button',{name:'Etiquetar «Pasiva propia»'}).first().click();
  modal=page.locator('.modal').last();
  await expect(modal.getByText('Sin etiquetas confirmadas')).toBeVisible();
  await modal.getByRole('searchbox',{name:'Buscar etiqueta del banco'}).fill('voz pasiva');
  await modal.getByRole('checkbox',{name:'Voz pasiva',exact:true}).check();
  await expect(modal).toContainText('Confirmadas (1)');
  await modal.getByRole('button',{name:'Cerrar'}).click();
  await page.reload();
  const saved=await page.evaluate(async()=>{
    const {WorkspaceRepository}=await import('/storage/workspace-repository.js');
    const {corpus}=await new WorkspaceRepository().loadCorpus();
    return corpus.texts.find(t=>t.title==='Pasiva propia')?.tagIds;
  });
  expect(saved).toContain('gram.voz.pasiva');
  page.once('dialog',d=>d.accept('Cuaderno desde banco'));
  await page.getByRole('button',{name:'Nuevo cuaderno'}).click();
  await page.getByRole('button',{name:'Banco propio'}).click();
  await page.getByRole('button',{name:'Añadir «Pasiva propia» al cuaderno'}).click();
  await expect(page.locator('.edition-counter')).toHaveText('Texto 1 de 1');
  const tags=await page.evaluate(async()=>{
    const {WorkspaceRepository}=await import('/storage/workspace-repository.js');
    const snapshots=await new WorkspaceRepository().listEditions();
    return snapshots.find(n=>n.edition.title==='Cuaderno desde banco')
      ?.edition.placements[0]?.grammaticalTagIds;
  });
  expect(tags).toContain('gram.voz.pasiva');
});

test('Banco propio: Collatinus propone pero no confirma hasta la decisión docente',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  await page.getByRole('button',{name:'Pegar texto al banco'}).click();
  let modal=page.locator('.modal').last();
  await modal.getByRole('textbox',{name:'Título'}).fill('Revisión automática');
  await modal.getByRole('textbox',{name:'Texto latino'}).fill('Amatus est. Loquitur.');
  await modal.getByRole('button',{name:'Guardar en el banco'}).click();
  await page.locator('.cuaderno-home-category').first().locator('summary').first().click();
  await page.getByRole('button',{name:'Etiquetar «Revisión automática»'}).first().click();
  modal=page.locator('.modal').last();
  await modal.getByRole('button',{name:'Analizar texto'}).click();
  await expect(modal.locator('.bank-grammar-candidate')).not.toHaveCount(0);
  const pending=modal.locator('.bank-grammar-candidate[data-state=pending]').first();
  await expect(pending.getByText('Pendiente',{exact:true})).toBeVisible();
  await pending.getByRole('button',{name:'Descartar'}).click();
  await expect(modal.locator('.bank-grammar-candidate[data-state=rejected]')).not.toHaveCount(0);
  const stored=await page.evaluate(async()=>{
    const {WorkspaceRepository}=await import('/storage/workspace-repository.js');
    const {corpus}=await new WorkspaceRepository().loadCorpus();
    const source=corpus.texts.find(t=>t.title==='Revisión automática');
    return {tags:source?.tagIds,reviews:source?.bankGrammarDecisions};
  });
  expect(stored.tags).toEqual([]);
  expect(stored.reviews.some(r=>r.status==='rejected')).toBe(true);
  await modal.getByRole('button',{name:'Cerrar'}).click();
  await page.reload();
  await page.locator('.cuaderno-home-category').first().locator('summary').first().click();
  await page.getByRole('button',{name:'Etiquetar «Revisión automática»'}).first().click();
  modal=page.locator('.modal').last();
  await modal.getByRole('button',{name:'Analizar texto'}).click();
  await expect(modal.locator('.bank-grammar-candidate[data-state=rejected]')).not.toHaveCount(0);
});
