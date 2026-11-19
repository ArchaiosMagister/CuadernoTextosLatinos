import {test,expect} from '@playwright/test';

test('Revisar cuaderno protege la palabra docente y permite sustituir la otra aparición',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  await expect(page.getByRole('combobox',{name:'Elegir cuaderno',exact:true})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept('Repeticiones'));
  await page.locator('#btnNew').click();
  for(const [title,latin] of [['Pasaje uno','Caesar Galliam vicit.'],['Pasaje dos','Roma urbs vetus est.']]){
    await page.getByRole('button',{name:'Pegar texto',exact:true}).click();
    const modal=page.locator('.modal').last();
    await modal.getByRole('textbox',{name:'Título'}).fill(title);
    await modal.getByRole('textbox',{name:'Texto latino'}).fill(latin);
    await modal.getByRole('button',{name:'Añadir al cuaderno'}).click();
    await expect(page.locator('.edition-counter')).toContainText(title==='Pasaje uno'?'Texto 1 de 1':'Texto 2 de 2');
  }
  const fixture=await page.evaluate(async()=>{
    const {WorkspaceRepository}=await import('/storage/workspace-repository.js');
    const repository=new WorkspaceRepository();
    const [state]=await repository.listEditions();
    const now=new Date().toISOString();
    const prefixOf=p=>p.questions.find(q=>q.kind==='choice').options.find(o=>o.kind==='prefix');
    const first=prefixOf(state.edition.placements[0]).slots[0];
    const second=prefixOf(state.edition.placements[1]).slots[0];
    await repository.commitEdition(state.edition.id,state.revision,
      {command:'test.repetition',targetId:second.id,timestamp:now},edition=>{
        const a=prefixOf(edition.placements[0]).slots[0];
        Object.assign(a,{origin:'manual',locked:true,provenance:null});
        const b=prefixOf(edition.placements[1]).slots[0];
        Object.assign(b,{value:first.value,proposedLemmaId:first.proposedLemmaId,provenance:first.provenance});
        return {...edition,updatedAt:now};
      });
    return {first:first.id,second:second.id,word:first.value};
  });
  await page.reload();
  const audit=page.getByText('Revisar cuaderno',{exact:true});
  await audit.click();
  await expect(page.locator('.edition-audit')).toContainText('Pasaje uno (protegida)');
  await page.getByRole('button',{name:/Pasaje dos · Sustituir por/}).click();
  const readSlots=()=>page.evaluate(async fixture=>{
    const {WorkspaceRepository}=await import('/storage/workspace-repository.js');
    const [state]=await new WorkspaceRepository().listEditions();
    const slots=state.edition.placements.flatMap(p=>p.questions.flatMap(q=>q.kind==='choice'
      ?q.options.flatMap(o=>o.slots):[]));
    return {
      first:slots.find(s=>s.id===fixture.first),second:slots.find(s=>s.id===fixture.second),
    };
  },fixture);
  await expect.poll(async()=>(await readSlots()).second.value).not.toBe(fixture.word);
  const result=await readSlots();
  expect(result.first.value).toBe(fixture.word);
  expect(result.first.locked).toBe(true);
  expect(result.second.value).not.toBe(fixture.word);
});
