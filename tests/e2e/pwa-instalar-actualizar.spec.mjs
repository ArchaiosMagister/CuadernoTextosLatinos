import {test,expect} from '@playwright/test';

test('PWA: manifiesto e iconos PNG instalables en la ruta real del cuaderno',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  await expect(page.getByRole('heading',{name:'Mis cuadernos'})).toBeVisible();
  const manifestLink=page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute('href','./manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]'))
    .toHaveAttribute('href','./icons/apple-touch-icon.png');
  const result=await page.evaluate(async()=>{
    const link=document.querySelector('link[rel="manifest"]');
    if(!(link instanceof HTMLLinkElement))throw Error('Falta el manifiesto');
    const response=await fetch(link.href);
    if(!response.ok)throw Error('Manifiesto inaccesible');
    const manifest=await response.json();
    return {manifest,base:location.href};
  });
  expect(result.manifest.name).toBe('Cuaderno de textos latinos');
  expect(result.manifest.start_url).toBe('./');
  expect(result.manifest.scope).toBe('./');
  expect(result.manifest.display).toBe('standalone');
  for(const icon of result.manifest.icons){
    const url=new URL(icon.src,result.base);
    const resp=await page.request.get(url.toString());
    expect(resp.ok(),icon.src).toBe(true);
    if(icon.type==='image/png'){
      const png=await resp.body();
      expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
      const size=Number(icon.sizes.split('x')[0]);
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  }
  const apple=await page.request.get('/examinator-cuadernos/icons/apple-touch-icon.png');
  expect(apple.ok()).toBe(true);
  expect((await apple.body()).readUInt32BE(16)).toBe(180);
});
test('PWA: el botón comprueba actualizaciones y no reemplaza automáticamente el SW',async({page})=>{
  await page.goto('/examinator-cuadernos/');
  const bank=page.locator('.cuaderno-home-pwa');
  await expect(bank.getByRole('button',{name:'Buscar actualizaciones'})).toBeVisible();
  const worker=await page.request.get('/examinator-cuadernos/service-worker.js');
  expect(worker.ok()).toBe(true);
  const source=await worker.text();
  expect(source).toContain('const MANUAL_UPDATES = true');
  expect(source).toContain("event.data.type === 'APPLY_UPDATE'");
  expect(source).toContain('if (!MANUAL_UPDATES) await self.skipWaiting()');
  await bank.getByRole('button',{name:'Buscar actualizaciones'}).click();
  await expect(bank.locator('[data-pwa-status]'))
    .toContainText(/actualizada|nueva versi[oó]n|descargando|no se ha podido/i,{timeout:20000});
  // El botón de instalación manual permanece disponible en Safari/WebKit.
  const help=bank.locator('[data-pwa-install]');
  await expect(help).toBeVisible();
  await help.click();
  await expect(bank.locator('[data-pwa-status]')).toContainText(/navegador|Safari/i);
  page.once('dialog',dialog=>dialog.accept('Prueba PWA'));
  await page.locator('#btnNew').click();
  await expect(page.locator('.edition-paper')).toBeVisible();
  await page.getByRole('button',{name:'Más',exact:true}).click();
  const more=page.locator('#cuadernoMoreTools');
  await expect(more.getByRole('button',{name:'Buscar actualizaciones'})).toBeVisible();
  await expect(more.locator('[data-pwa-install]')).toBeVisible();
});
