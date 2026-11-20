import {test,expect} from '@playwright/test';

const tinyPng=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6d5t8AAAAASUVORK5CYII=',
  'base64',
);

async function prepare(page){
  await page.goto('/examinator-cuadernos/');
  page.once('dialog',dialog=>dialog.accept('Cuaderno con portada'));
  await page.getByRole('button',{name:'Nuevo cuaderno'}).click();
  await page.getByRole('button',{name:'Pegar texto',exact:true}).click();
  const modal=page.locator('.modal').last();
  await modal.getByRole('textbox',{name:'Título'}).fill('Los helvecios');
  await modal.getByRole('textbox',{name:'Texto latino'}).fill('Helvetii impedimenta in unum locum contulerunt.');
  await modal.getByRole('button',{name:'Añadir al cuaderno'}).click();
  await expect(page.locator('.edition-counter')).toContainText('Texto 1 de 1');
  await page.getByRole('button',{name:'Organizar',exact:true}).click();
  const details=page.locator('.edition-cover-editor');
  await details.locator('summary').click();
  await expect(details.getByRole('button',{name:'Elegir foto Panteón de Roma'})).toBeVisible();
  return details;
}

test('iPad: portada propia se guarda, es editable y forma primera hoja del PDF',async({page})=>{
  await page.setViewportSize({width:820,height:1180});
  const details=await prepare(page);
  await details.locator('input[type="file"][aria-label="Subir imagen de portada propia"]').setInputFiles({
    name:'portada.png',mimeType:'image/png',buffer:tinyPng,
  });
  await expect(details.getByRole('textbox',{name:'Título de portada'})).toBeVisible();
  await details.getByRole('textbox',{name:'Título de portada'}).fill('CUADERNO DE LATÍN II');
  await details.getByRole('textbox',{name:'Curso'}).fill('2026-2027');
  await details.getByRole('combobox',{name:'Color de portada'}).selectOption('gray');
  await details.getByRole('checkbox',{name:'Reflejo de fotografía'}).check();
  await page.getByRole('button',{name:'Ver cuaderno completo'}).click();
  const cover=page.locator('.edition-cover').first();
  await expect(cover).toBeVisible();
  await expect(cover).toContainText('CUADERNO DE LATÍN II');
  await expect(cover).toContainText('NOMBRE Y APELLIDOS:');
  await expect(cover.locator('img.edition-cover-photo')).toHaveAttribute('src',/^data:image\/jpeg;base64,/);
  const saved=await page.evaluate(async()=>{
    const {WorkspaceRepository}=await import('/storage/workspace-repository.js');
    const editions=await new WorkspaceRepository().listEditions();
    return editions.find(e=>e.edition.title==='Cuaderno con portada')?.edition.cover;
  });
  expect(saved.imageDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  expect(saved.title).toBe('CUADERNO DE LATÍN II');
  expect(saved.imageCredit).toContain('Imagen propia');
  const printed=await page.evaluate(async()=>{
    const {WorkspaceRepository}=await import('/storage/workspace-repository.js');
    const {renderNotebookPrintPages}=await import('/ui/edition-app.js');
    const edition=(await new WorkspaceRepository().listEditions())
      .find(e=>e.edition.title==='Cuaderno con portada').edition;
    const fragment=renderNotebookPrintPages(edition);
    return {
      first:fragment.firstElementChild?.className,
      count:fragment.querySelectorAll('.edition-paper').length,
      image:fragment.querySelector('.edition-cover-photo')?.getAttribute('src')?.slice(0,23),
    };
  });
  expect(printed.first).toBe('edition-cover');
  expect(printed.count).toBe(1);
  expect(printed.image).toBe('data:image/jpeg;base64,');
  await page.reload();
  await page.locator('.cuaderno-home-card').filter({hasText:'Cuaderno con portada'})
    .getByRole('button',{name:'Abrir'}).click();
  await page.getByRole('button',{name:'Ver cuaderno completo'}).click();
  await expect(page.locator('.edition-cover')).toContainText('CUADERNO DE LATÍN II');
});

test('catálogo CC0 incorpora una foto al cuaderno sin introducir dependencia posterior de red',async({page})=>{
  const details=await prepare(page);
  await page.route('https://upload.wikimedia.org/**',route=>route.fulfill({
    status:200,contentType:'image/png',body:tinyPng,
  }));
  await details.getByRole('button',{name:'Elegir foto Panteón de Roma'}).click();
  await expect(page.getByRole('textbox',{name:'Título de portada'})).toBeVisible();
  const credit=await page.evaluate(async()=>{
    const {WorkspaceRepository}=await import('/storage/workspace-repository.js');
    const editions=await new WorkspaceRepository().listEditions();
    return editions.find(e=>e.edition.title==='Cuaderno con portada')?.edition.cover?.imageCredit;
  });
  expect(credit).toContain('CC0');
  expect(credit).toContain('Panteón');
});
