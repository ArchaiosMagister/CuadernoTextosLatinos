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
  return latin.evaluate(paragraph=>{
    function candidate(){
      const walk=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
      let node;
      let first=null;
      while((node=walk.nextNode())){
        const text=node.textContent??'';
        for(const m of text.matchAll(/[\p{L}][\p{L}\p{M}]*/gu)){
          const range=document.createRange();
          range.setStart(node,m.index);range.setEnd(node,m.index+m[0].length);
          for(const rect of range.getClientRects()){
            if(rect.width<=0||rect.height<=0)continue;
            const point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
            const actual=document.elementFromPoint(point.x,point.y);
            if(actual?.closest('.edition-latin')===paragraph)return point;
            if(!first)first={point,target:actual?.outerHTML.slice(0,220)??''};
          }
        }
      }
      return {first};
    }
    const first=candidate();
    if('x' in first)return first;
    // Tras el scroll de Playwright, evitar que una barra fija cubra el texto.
    const scroller=paragraph.closest('.edition-preview-stack');
    if(scroller instanceof HTMLElement)scroller.scrollTop=Math.max(0,scroller.scrollTop-130);
    const second=candidate();
    if('x' in second)return second;
    throw Error('No se encontró una palabra visible y pulsable: '+
      JSON.stringify({before:first,after:second,
        scrollTop:scroller?.scrollTop,
        viewport:{width:innerWidth,height:innerHeight}}));
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
