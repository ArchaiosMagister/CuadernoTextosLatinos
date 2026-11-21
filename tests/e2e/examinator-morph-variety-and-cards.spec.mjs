import {test,expect} from '@playwright/test';

async function addLatin(page,latin){
  await page.goto('/examinator-cuadernos/');
  await expect(page.getByRole('heading',{name:'Mis cuadernos'})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept('Morfología variada'));
  await page.locator('#btnNew').click();
  await page.getByRole('button',{name:'Pegar texto',exact:true}).click();
  const modal=page.locator('.modal').last();
  await modal.getByRole('textbox',{name:'Texto latino'}).fill(latin);
  await modal.getByRole('button',{name:'Añadir al cuaderno'}).click();
  await expect(page.locator('.edition-counter')).toContainText('Texto 1 de 1');
  // El editor puede renderizar la hoja antes de que se cierre el diálogo asíncrono.
  await expect(page.locator('.modal-bg')).toHaveCount(0);
}

async function firstLatinWordPoint(latin){
  return latin.evaluate(paragraph=>{
    const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      const match=/[\p{L}][\p{L}\p{M}]*/u.exec(node.textContent??'');
      if(!match)continue; // Puede haber nodos de texto vacíos antes del primer subrayado.
      const range=document.createRange();
      range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
      for(const rect of range.getClientRects()){
        if(rect.width<=0||rect.height<=0)continue;
        const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
        const found=document.elementFromPoint(x,y);
        if(found&&paragraph.contains(found))return {x,y,word:match[0]};
      }
    }
    throw Error('No se encontró ninguna palabra latina visible y accesible.');
  });
}

test('cuatro palabras de tipos diferentes en el menú docente; la hoja conserva solo los subrayados',async({page})=>{
  const latin='Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae, aliam Aquitani, tertiam qui ipsorum lingua Celtae, nostra Galli appellantur.';
  await addLatin(page,latin);
  await page.locator('.edition-menu-nav').getByRole('button',{name:'Preguntas'}).click();
  const morph=page.locator('.edition-question-panel[data-kind="morphology"]');
  await expect(morph.locator('.edition-academic-morph-row')).toHaveCount(4,{timeout:30000});
  const types=await morph.locator('.edition-academic-morph-row .edition-morph-category').evaluateAll(
    nodes=>nodes.map(n=>n.dataset.category));
  expect(types).toHaveLength(4);
  expect(new Set(types).size).toBe(4);
  await expect(morph.locator('.edition-morph-category-legend .edition-morph-category')).toHaveCount(7);
  await expect(page.locator('.edition-paper .edition-morph-category')).toHaveCount(0);
  await expect(page.locator('.edition-paper .edition-latin .edition-underlined')).toHaveCount(4);
});

test('tarjeta de lectura al tocar la palabra: Collatinus y alternativas fuera de la hoja exportable',async({page})=>{
  await addLatin(page,'Gallia est omnis divisa in partes tres.');
  const latin=page.locator('.edition-preview .edition-latin').first();
  await expect(latin).toBeVisible();
  await latin.scrollIntoViewIfNeeded();
  // Seleccionar un token visible, no un nodo de texto vacío ni un margen A4.
  const point=await firstLatinWordPoint(latin);
  await page.mouse.click(point.x,point.y);
  const card=page.getByRole('dialog',{name:/Lematización de/});
  await expect(card).toBeVisible();
  await expect(card.locator('.edition-lexical-card-body')).not.toContainText('Consultando Collatinus',{timeout:20000});
  await expect(card).toContainText('Collatinus');
  await expect(page.locator('.edition-paper .edition-lexical-card')).toHaveCount(0);
  await card.getByRole('button',{name:'Cerrar ficha'}).click();
  await expect(card).toHaveCount(0);
});


test.describe('lectura táctil en iPad',()=>{
  test.use({hasTouch:true,viewport:{width:820,height:1180}});
  test('una pulsación táctil abre y permite cerrar la tarjeta',async({page})=>{
    await addLatin(page,'Gallia est omnis divisa in partes tres.');
    const latin=page.locator('.edition-preview .edition-latin').first();
    await expect(latin).toBeVisible();
  await latin.scrollIntoViewIfNeeded();
    const point=await firstLatinWordPoint(latin);
    await page.touchscreen.tap(point.x,point.y);
    const card=page.getByRole('dialog',{name:/Lematización de/});
    await expect(card).toBeVisible();
    await card.getByRole('button',{name:'Cerrar ficha'}).click();
    await expect(card).toHaveCount(0);
  });
});
