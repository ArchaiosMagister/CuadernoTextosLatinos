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
  // Pulsar sobre el primer término real; un desplazamiento fijo puede caer en la sangría A4.
  const point=await latin.evaluate(paragraph=>{
    const walk=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
    const first=walk.nextNode();
    if(!first)throw Error('El párrafo no contiene texto.');
    const range=document.createRange();range.setStart(first,0);range.setEnd(first,6);
    const rect=range.getBoundingClientRect();
    return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
  });
  const probe=await page.evaluate(({x,y})=>{
    const element=document.elementFromPoint(x,y);
    const paragraph=element?.closest('.edition-latin');
    const region=document.querySelector('.edition-paper-pages');
    const selection=window.getSelection();
    const clickTarget=element?.outerHTML.slice(0,250)??'ninguno';
    return {point:{x,y},target:clickTarget,inParagraph:Boolean(paragraph),
      inRegion:Boolean(paragraph&&region?.contains(paragraph)),
      selection:selection?.toString().slice(0,80),
      paragraph:paragraph?.textContent.slice(0,75),role:region?.getAttribute('role')};
  },point);
  console.log('LECTOR_HIT_DESKTOP',JSON.stringify(probe));
  page.on('pageerror',error=>console.log('LECTOR_PAGE_ERROR',String(error.stack??error)));
  await page.mouse.click(point.x,point.y);
  console.log('LECTOR_AFTER_CLICK',JSON.stringify(await page.evaluate(()=>({
    cardCount:document.querySelectorAll('.edition-lexical-card').length,
    target:document.activeElement?.tagName,
    selection:window.getSelection()?.toString().slice(0,80),
  }))));
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
    const point=await latin.evaluate(paragraph=>{
      const text=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT).nextNode();
      if(!text)throw Error('No hay palabras latinas.');
      const range=document.createRange();range.setStart(text,0);range.setEnd(text,6);
      const rect=range.getBoundingClientRect();
      return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    });
    console.log('LECTOR_HIT_IPAD',JSON.stringify(await page.evaluate(({x,y})=>{
      const element=document.elementFromPoint(x,y);
      const paragraph=element?.closest('.edition-latin');
      return {point:{x,y},target:element?.outerHTML.slice(0,200),
        inParagraph:Boolean(paragraph),selection:window.getSelection()?.toString().slice(0,60)};
    },point)));
    page.on('pageerror',error=>console.log('LECTOR_PAGE_ERROR_IPAD',String(error.stack??error)));
    await page.touchscreen.tap(point.x,point.y);
    console.log('LECTOR_AFTER_TOUCH',JSON.stringify(await page.evaluate(()=>({
      cards:document.querySelectorAll('.edition-lexical-card').length,
      selection:window.getSelection()?.toString().slice(0,80),
    }))));
    const card=page.getByRole('dialog',{name:/Lematización de/});
    await expect(card).toBeVisible();
    await card.getByRole('button',{name:'Cerrar ficha'}).click();
    await expect(card).toHaveCount(0);
  });
});
