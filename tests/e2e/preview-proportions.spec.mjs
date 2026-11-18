import {test,expect} from '@playwright/test';

test('editor de cuadernos: menús 45 % y vista previa 55 % en iPad y escritorio',async({page})=>{
  await page.setViewportSize({width:1024,height:900});
  await page.goto('/examinator-cuadernos/');
  await expect(page.locator('#editor .card')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept('Cuaderno de proporciones'));
  await page.locator('#btnNew').click();
  await expect(page.locator('body')).toHaveAttribute('data-has-editor','true');
  for(const width of [820,1024,1366]){
    await page.setViewportSize({width,height:900});
    const geometry=await page.evaluate(()=>{
      const left=document.querySelector('#editor').getBoundingClientRect();
      const right=document.querySelector('#editor .edition-preview-stack').getBoundingClientRect();
      const viewport=document.documentElement.clientWidth;
      return {leftWidth:left.width,rightX:right.x,rightWidth:right.width,viewport,
        position:getComputedStyle(document.querySelector('#editor .edition-preview-stack')).position};
    });
    expect(geometry.leftWidth/geometry.viewport).toBeCloseTo(.45,2);
    expect(geometry.rightWidth/geometry.viewport).toBeCloseTo(.55,2);
    expect(Math.abs(geometry.rightX-geometry.leftWidth)).toBeLessThan(2);
    expect(geometry.position).toBe('fixed');
    await expect(page.getByRole('navigation',{name:'Secciones del cuaderno'}).getByRole('button')).toHaveCount(5);
  }
});

test('móvil: conserva la disposición apilada sin superposición',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/examinator-cuadernos/');
  await expect(page.locator('#editor .card')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept('Cuaderno móvil'));
  await page.locator('#btnNew').click();
  await expect(page.locator('body')).toHaveAttribute('data-has-editor','true');
  await expect(page.locator('#preview')).toBeHidden();
  const layout=await page.evaluate(()=>{
    const editor=document.querySelector('#editor').getBoundingClientRect();
    const preview=document.querySelector('#editor .edition-preview-stack').getBoundingClientRect();
    return {editorWidth:editor.width,previewWidth:preview.width,
      editorX:editor.x,previewX:preview.x,
      position:getComputedStyle(document.querySelector('#editor .edition-preview-stack')).position};
  });
  expect(layout.position).toBe('static');
  expect(layout.previewWidth).toBeLessThanOrEqual(layout.editorWidth);
  expect(layout.previewX).toBeGreaterThanOrEqual(layout.editorX);
});
