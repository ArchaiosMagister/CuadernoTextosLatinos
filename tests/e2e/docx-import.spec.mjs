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
        {text:'ei',under:true},'.']),
      p(['Vocabulario']),
      p(['Ægyptus, −ī: ‘Egipto’']),
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
  await expect(page.getByText('4 subrayados · 2 entradas reales de vocabulario.')).toBeVisible();
  await page.getByRole('button',{name:'Incorporar al cuaderno'}).click();
  await expect(page.locator('.edition-paper-title')).toHaveText(
    'Los romanos envían legados a Ptolomeo prometiéndole ayuda',{timeout:30000});
  await expect(page.locator('.edition-paper-source')).toContainText('Eutropio');
  await expect(page.locator('.edition-underlined')).toHaveCount(4);
  await expect(page.locator('.edition-vocabulary-line')).toHaveCount(2);
  const edition=page.locator('.edition-paper').first();
  await expect(edition).toContainText('Latinismos');
  await expect(edition.locator('.edition-choice-options > li')).toHaveCount(4);
  // No basta con crear el encabezado: latinismos ha de recibir términos del banco.
  await expect(edition.locator('.edition-choice-options > li').nth(3).locator('em')).toHaveCount(4);
  await expect(edition).not.toContainText('A, B, C y D');
});

test('Salustio sin vocabulario en Word: no lematizar todas las palabras, mantener formato Examinator2',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/examinator-cuadernos/');
  await expect(page.locator('#editor .card')).toBeVisible();
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
  // Ni el importador ni la búsqueda conservadora pueden insertar formas
  // comunes sin glosa como si fueran un vocabulario docente completo.
  await expect(page.locator('.edition-vocab-headword')).not.toHaveValue('homines');
  const all=await page.locator('.edition-vocab-headword').evaluateAll(nodes=>
    nodes.map(node=>node.value.toLowerCase()));
  expect(all).not.toContain('homines');
  expect(all).not.toContain('praestare');
  expect(created).toBeLessThan(5);
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
      textSizeAdjust:getComputedStyle(paper).webkitTextSizeAdjust,
    };
  });
  expect(metrics.latinLineHeight).toBeCloseTo(20.8,0); // (10,5×1,2 + 3) pt
  expect(metrics.spaceAfterLatin).toBeGreaterThanOrEqual(0);
  expect(metrics.spaceAfterLatin).toBeLessThan(12);
  expect(Math.abs(metrics.headingFont-metrics.subFont)).toBeLessThan(0.5);
  expect(metrics.textSizeAdjust).toBe('100%');
  await tabs.getByRole('button',{name:'Formato'}).click();
  await expect(page.getByRole('spinbutton',{name:'Espacio adicional entre líneas (pt)'})).toHaveValue('3');
  await tabs.getByRole('button',{name:'Vocabulario'}).click();
  await page.locator('#btnSave').click();
  await page.reload();
  await page.locator('#btnOpen').click();
  await page.locator('.original-open-row .hbtn').first().click();
  await tabs.getByRole('button',{name:'Vocabulario'}).click();
  await expect(page.getByRole('textbox',{name:'Traducción de animal, -alis'})).toHaveValue('animal');
});
