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
  // El contador puede actualizarse antes de que el guardado asíncrono
  // cierre «Pegar texto latino». No probar tarjetas detrás del diálogo.
  await expect(page.locator('.modal-bg')).toHaveCount(0,{timeout:30000});
}

async function firstWordPoint(page){
  const latin=page.locator('.edition-preview .edition-latin').first();
  await expect(latin).toBeVisible();
  await latin.scrollIntoViewIfNeeded();
  const point=await latin.evaluate(paragraph=>{
    const walk=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
    let node=walk.nextNode(),match;
    while(node){
      match=(node.textContent??'').match(/[\p{L}][\p{L}\p{M}]*/u);
      if(match)break;
      node=walk.nextNode();
    }
    if(!node||!match)throw Error('No hay palabras latinas en la hoja.');
    const offset=(node.textContent??'').indexOf(match[0]);
    const range=document.createRange();
    range.setStart(node,offset);range.setEnd(node,offset+match[0].length);
    const rect=range.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)throw Error('La palabra no está maquetada en pantalla.');
    return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
  });
  const probe=await page.evaluate(({x,y})=>{
    const elem=document.elementFromPoint(x,y),paragraph=document.querySelector('.edition-preview .edition-latin');
    return {point:{x,y},hit:elem?.outerHTML.slice(0,280)??null,
      hitLatin:Boolean(elem?.closest('.edition-latin')),
      paragraphRect:paragraph?.getBoundingClientRect().toJSON()??null,
      paragraphText:paragraph?.textContent?.slice(0,100)??null,
      modalCount:document.querySelectorAll('.modal-bg').length,
      viewport:[window.innerWidth,window.innerHeight],
      paper:paragraph?.closest('.edition-paper')?.getBoundingClientRect().toJSON()??null};
  },point);
  console.log('LEXICAL_HIT_PROBE',JSON.stringify(probe));
  expect(probe.hitLatin,JSON.stringify(probe)).toBe(true);
  return point;
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

test('clic sobre una palabra latina abre ficha Collatinus sin contaminar el A4',async({page})=>{
  await addLatin(page,'Gallia est omnis divisa in partes tres.');
  const point=await firstWordPoint(page);
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
    const point=await firstWordPoint(page);
    await page.touchscreen.tap(point.x,point.y);
    const card=page.getByRole('dialog',{name:/Lematización de/});
    await expect(card).toBeVisible();
    await card.getByRole('button',{name:'Cerrar ficha'}).click();
    await expect(card).toHaveCount(0);
  });
});
