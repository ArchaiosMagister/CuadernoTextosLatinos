import {test,expect} from '@playwright/test';
import {deflateRawSync} from 'node:zlib';

/** ZIP DOCX comprimido de un fichero, sin librerías de terceros. */
function sampleDocx(xml){
  const name=Buffer.from('word/document.xml'),source=Buffer.from(xml,'utf8');
  const zipped=deflateRawSync(source);
  const local=Buffer.alloc(30+name.length),central=Buffer.alloc(46+name.length),tail=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt16LE(8,8);local.writeUInt32LE(zipped.length,18);
  local.writeUInt32LE(source.length,22);local.writeUInt16LE(name.length,26);
  name.copy(local,30);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);
  central.writeUInt32LE(zipped.length,20);central.writeUInt32LE(source.length,24);
  central.writeUInt16LE(name.length,28);name.copy(central,46);
  tail.writeUInt32LE(0x06054b50,0);tail.writeUInt16LE(1,8);
  tail.writeUInt16LE(1,10);tail.writeUInt32LE(central.length,12);
  tail.writeUInt32LE(local.length+zipped.length,16);
  return Buffer.concat([local,zipped,central,tail]);
}
function p(parts){
  return '<w:p>'+parts.map(part=>{
    const txt=typeof part==='string'?part:part.text;
    const u=typeof part==='string'?'':part.under?'<w:rPr><w:u w:val="single"/></w:rPr>':'';
    return '<w:r>'+u+'<w:t xml:space="preserve">'+txt+'</w:t></w:r>';
  }).join('')+'</w:p>';
}
function documentXml(){
  return '<?xml version="1.0"?>'+
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
    [
      p(['Texto de repaso\tLatín II']),
      p(['Nombre y apellidos:       Fecha:']),
      p(['Los romanos envían legados a Ptolomeo prometiéndole ayuda']),
      p(['Eutropio, Breviarium III 1']),
      p(['Finito igitur Punico bello, quod per XXIII annos ',
        {text:'tractum est',under:true},', Romani iam ',
        {text:'clarissima',under:true},' gloria ',
        {text:'noti',under:true},', legatos miserunt auxilia promittentes ',
        {text:'ei',under:true},' in Aegyptum, quia rex Syriæ Antiochus bellum ei intulerat.']),
      p(['Vocabulario']),
      p(['Ægyptus, −ī: ‘Egipto’']),
      p(['Aegyptus, −ī: ‘Egipto’']),
      p(['Sўrĭa, −æ: ‘Siria’ (provincia romana)']),
      p(['grātĭās ăgĕre: “dar las gracias”']),
      p(['Traducción del texto. (4p.)']),
      p(['Análisis sintáctico del texto. (1p.)']),
      p(['Análisis morfológico de las palabras subrayadas. (1p.)']),
      p(['Elige dos de estas tres preguntas (2p.):']),
      p(['Modificación preverbial a partir de A (3) y de B (2).']),
      p(['Evolución fonética de A, B, C y D.']),
      p(['Señala el prefijo y el significado que aporta a estas palabras: A, B, C, D.']),
    ].join('')+'</w:body></w:document>';
}
test('iPad: importar DOCX offline con subrayados, vocabulario y latinismos generados',async({page})=>{
  await page.setViewportSize({width:820,height:1180});
  await page.goto('/examinator-cuadernos/');
  await expect(page.locator('#editor .card')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept('Cuaderno de importación'));
  await page.locator('#btnNew').click();
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Importar Word'}).click();
  await (await chooser).setFiles({name:'eutropio.docx',
    mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer:sampleDocx(documentXml())});
  await expect(page.getByRole('button',{name:'Incorporar al cuaderno'})).toBeVisible();
  await expect(page.getByText('4 subrayados · 4 entradas reales de vocabulario.')).toBeVisible();
  await page.getByRole('button',{name:'Incorporar al cuaderno'}).click();
  await expect(page.locator('.edition-paper-title')).toHaveText(
    'Los romanos envían legados a Ptolomeo prometiéndole ayuda',{timeout:30000});
  await expect(page.locator('.edition-paper-source')).toContainText('Eutropio');
  await expect(page.locator('.edition-underlined')).toHaveCount(4);
  await page.getByRole('button',{name:'Vocabulario',exact:true}).click();
  await expect.poll(()=>page.locator('.edition-vocab-row').count(),{timeout:110000}).toBeGreaterThan(3);
  const vocabularyLines=page.locator('.edition-vocabulary-line');
  await expect(vocabularyLines.filter({hasText:/Egipto/i})).toHaveCount(1);
  const syria=vocabularyLines.filter({hasText:/Siria/i});
  await expect(syria).toHaveCount(1);
  await expect(syria).toContainText('Sўrĭa, −æ');
  const syriaHeads=page.locator('.edition-vocab-headword');
  expect(await syriaHeads.evaluateAll(inputs=>inputs.map(input=>input.value)
    .filter(value=>/^s[yу]ria(?:e|m)?$/i.test(value.split(',')[0].normalize('NFD')
      .replace(/\p{M}/gu,'').replaceAll('æ','ae').trim())))).toEqual(['Sўrĭa, −æ']);
  await expect(syria).toContainText('provincia romana');
  const edition=page.locator('.edition-paper').first();
  await expect(edition).toContainText('Latinismos');
  await expect(edition.locator('.edition-choice-options > li')).toHaveCount(4);
  // No basta con crear el encabezado: latinismos ha de recibir términos del banco.
  await expect(edition.locator('.edition-choice-options > li').nth(3).locator('em')).toHaveCount(4);
  await expect(edition).not.toContainText('A, B, C y D');
});

test('Salustio sin vocabulario en Word: analizar todo el pasaje sin marcar palabras comunes',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/examinator-cuadernos/');
  await expect(page.locator('#editor .card')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Mis cuadernos'})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept('Cuaderno de Salustio'));
  await page.locator('#btnNew').click();
  const latin='Omnis homines qui sese student praestare ceteris animalibus summa ope niti decet.';
  const xml='<?xml version="1.0"?>'+
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
    p(['Texto de repaso'])+p(['Nombre:     Fecha:'])+
    p(['Salustio. Reflexión inicial'])+p(['Salustio, Bellum Catilinae I 1'])+
    p([latin])+p(['Vocabulario'])+p(['Traducción del texto. (4p.)'])+
    p(['Análisis sintáctico del texto. (1p.)'])+
    p(['Análisis morfológico de las palabras subrayadas. (1p.)'])+
    '</w:body></w:document>';
  const choose=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Importar Word'}).click();
  await (await choose).setFiles({name:'salustio.docx',
    mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer:sampleDocx(xml)});
  await expect(page.getByText(/0 entradas reales de vocabulario/)).toBeVisible();
  await page.getByRole('button',{name:'Incorporar al cuaderno'}).click();
  await expect(page.locator('.edition-latin')).toContainText('Omnis homines');
  const tabs=page.getByRole('navigation',{name:'Secciones del cuaderno'});
  await tabs.getByRole('button',{name:'Vocabulario'}).click();
  await expect(page.getByRole('button',{name:/Buscar otras formas/})).toBeVisible();
  await expect.poll(()=>page.locator('.edition-vocab-headword').count(),
    {timeout:110000}).toBeGreaterThan(5);
  await expect(page.locator('.edition-vocab-include:checked')).toHaveCount(0);
  // Edición en filas, no una tarjeta apilada por lema.
  const newWord=page.getByRole('textbox',{name:'Enunciado nuevo'});
  await newWord.fill('animal, -alis');
  await page.getByRole('textbox',{name:'Traducción nueva'}).fill('animal');
  await page.getByRole('button',{name:'Añadir entrada'}).click();
  await expect(page.locator('.edition-vocab-row').filter({has:page.getByRole('textbox',{name:'Enunciado de animal, -alis'})})).toBeVisible();
  const newRow=page.locator('.edition-vocab-row').filter({has:page.getByRole('textbox',{name:'Enunciado de animal, -alis'})});
  await expect(newRow.locator('.edition-vocab-meaning')).toHaveValue('animal');
  const metrics=await page.evaluate(()=>{
    const paper=document.querySelector('.edition-paper');
    const latin=paper?.querySelector('.edition-latin');
    const vocab=paper?.querySelector('.edition-vocabulary');
    const heading=paper?.querySelector('.edition-question:last-child > strong');
    const sub=paper?.querySelector('.edition-choice-options > li');
    if(!latin||!vocab||!heading||!sub)throw Error('Falta el texto o un apartado');
    return {
      latinLineHeight:parseFloat(getComputedStyle(latin).lineHeight),
      spaceAfterLatin:vocab.getBoundingClientRect().top-latin.getBoundingClientRect().bottom,
      headingFont:parseFloat(getComputedStyle(heading).fontSize),
      subFont:parseFloat(getComputedStyle(sub).fontSize),
    };
  });
  expect(metrics.latinLineHeight).toBeCloseTo(20.8,0); // (10,5×1,2 + 3) pt
  expect(metrics.spaceAfterLatin).toBeGreaterThanOrEqual(0);
  expect(metrics.spaceAfterLatin).toBeLessThan(12);
  expect(Math.abs(metrics.headingFont-metrics.subFont)).toBeLessThan(0.5);
  // WebKit en Linux puede no exponer webkitTextSizeAdjust en CSSStyleDeclaration.
  // Comprobamos la regla realmente servida al navegador y la igualdad de tamaños
  // de letra medida arriba, sin depender de una API CSSOM no portable.
  const cssDeclarations=await page.locator('link[rel="stylesheet"]').evaluateAll(async links=>
    Promise.all(links.map(async link=>{
      const response=await fetch(link.href);
      if(!response.ok)throw Error('No se ha podido cargar '+link.href);
      return response.text();
    })));
  const paperRules=cssDeclarations
    .flatMap(css=>[...css.matchAll(/\.edition-paper\s*\{([^}]*)\}/g)].map(match=>match[1]));
  expect(paperRules.some(rule=>
    /(?:^|;)\s*-webkit-text-size-adjust\s*:\s*100%\s*;/.test(rule) &&
    /(?:^|;)\s*text-size-adjust\s*:\s*100%\s*;?/.test(rule)
  )).toBe(true);
  await tabs.getByRole('button',{name:'Formato'}).click();
  await expect(page.getByRole('spinbutton',{name:'Espacio adicional entre líneas (pt)'})).toHaveValue('3');
  const spacing=page.getByRole('spinbutton',{name:'Espacio adicional entre líneas (pt)'});
  await spacing.fill('0.9');
  const lineHeight=()=>page.locator('.edition-latin').evaluate(el=>parseFloat(getComputedStyle(el).lineHeight));
  const compactHeight=await lineHeight();
  await spacing.fill('5');
  expect(await lineHeight()-compactHeight).toBeCloseTo((5-.9)*4/3,1);
  await tabs.getByRole('button',{name:'Vocabulario'}).click();
  await page.locator('#btnSave').click();
  await expect(page.getByText('Cuaderno guardado.',{exact:true})).toBeVisible();
  await page.reload();
  await page.locator('.cuaderno-home-card').filter({hasText:'Cuaderno de Salustio'})
    .getByRole('button',{name:'Abrir'}).click();
  await tabs.getByRole('button',{name:'Vocabulario'}).click();
  await expect(page.getByRole('textbox',{name:'Traducción de animal, -alis'})).toHaveValue('animal');
});

test('selecciona varios Word y conserva el orden de los textos en un solo cuaderno',async({page})=>{
  await page.setViewportSize({width:390,height:740});
  await page.goto('/examinator-cuadernos/');
  await expect(page.getByRole('heading',{name:'Mis cuadernos'})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept('Cuaderno por lotes'));
  await page.locator('#btnNew').click();
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Importar Word',exact:true}).click();
  const file=name=>({name,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer:sampleDocx(documentXml())});
  await (await chooser).setFiles([file('primero.docx'),file('segundo.docx')]);
  const modal=page.locator('.modal').last();
  await expect(modal.locator('.word-review-item')).toHaveCount(2);
  const first=modal.locator('.word-review-item').nth(0);
  const second=modal.locator('.word-review-item').nth(1);
  await first.locator('summary').first().click();
  await first.getByRole('textbox',{name:'Título del texto'}).fill('Entrada primera');
  await second.locator('summary').first().click();
  await second.getByRole('textbox',{name:'Título del texto'}).fill('Entrada segunda');
  await expect(modal.locator('.mf').getByRole('button',{name:'Incorporar 2 textos'})).toBeInViewport();
  await modal.getByRole('button',{name:'Incorporar 2 textos'}).click();
  await expect(page.locator('.edition-counter')).toContainText('Texto 2 de 2');
  await expect(page.getByRole('combobox',{name:'Ir a texto del cuaderno'}).locator('option')).toHaveText([
    'Entrada primera','Entrada segunda',
  ]);
});

test('banco independiente: importa dos Word y recupera marcas y vocabulario al incorporarlos',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/examinator-cuadernos/');
  await expect(page.getByRole('heading',{name:'Mis cuadernos'})).toBeVisible();
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Importar Word al banco'}).click();
  const word=name=>({name,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer:sampleDocx(documentXml())});
  await (await chooser).setFiles([word('primero.docx'),word('segundo.docx')]);
  const modal=page.locator('.modal').last();
  await expect(modal.locator('.word-review-item')).toHaveCount(2);
  for(const [index,title] of ['Documento primero','Documento segundo'].entries()){
    const card=modal.locator('.word-review-item').nth(index);
    await card.locator('summary').first().click();
    await card.getByRole('textbox',{name:'Título del texto'}).fill(title);
  }
  await modal.getByRole('button',{name:'Guardar 2 textos en el banco'}).click();
  await expect(page.locator('.cuaderno-home-bank-heading')).toContainText('2 textos distintos');
  await page.reload();
  await expect(page.locator('.cuaderno-home-bank-heading')).toContainText('2 textos distintos');
  page.once('dialog',dialog=>dialog.accept('Cuaderno reutilización'));
  await page.getByRole('button',{name:'Nuevo cuaderno'}).click();
  await page.getByRole('button',{name:'Banco propio'}).click();
  await page.getByRole('button',{name:'Añadir «Documento primero» al cuaderno'}).click();
  await expect(page.locator('.edition-counter')).toContainText('Texto 1 de 1');
  await expect(page.locator('.edition-underlined')).toHaveCount(4);
  await expect(page.locator('.edition-vocabulary-line')).not.toHaveCount(0);
  const source=await page.evaluate(async()=>{
    const {WorkspaceRepository}=await import('/storage/workspace-repository.js');
    const ws=new WorkspaceRepository();
    const corpus=await ws.loadCorpus();
    const editions=await ws.listEditions();
    return {
      docs:corpus.corpus.texts.filter(x=>x.teacherDocument).length,
      source:editions.find(x=>x.edition.title==='Cuaderno reutilización')
        ?.edition.placements[0].source,
    };
  });
  expect(source.docs).toBe(2);
  expect(source.source.kind).toBe('corpus');
});
test('banco independiente: pegar sin cuaderno, conservarlo y buscarlo',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  await expect(page.getByRole('heading',{name:'Mis cuadernos'})).toBeVisible();
  await page.getByRole('button',{name:'Pegar texto al banco'}).click();
  const modal=page.locator('.modal').last();
  await modal.getByRole('textbox',{name:'Título'}).fill('Ejemplo de banco propio');
  await modal.getByRole('textbox',{name:'Texto latino'}).fill('Gallia est omnis divisa.');
  await modal.getByRole('button',{name:'Guardar en el banco'}).click();
  await expect(page.locator('.cuaderno-home-bank-heading')).toContainText('1 textos distintos');
  await page.getByRole('searchbox',{name:'Buscar en banco de textos propios'}).fill('Ejemplo de banco');
  await expect(page.locator('.cuaderno-home-bank-list')).toContainText('Ejemplo de banco propio');
  await page.reload();
  await expect(page.locator('.cuaderno-home-bank-heading')).toContainText('1 textos distintos');
  await expect(page.locator('#preview')).toBeHidden();
});
