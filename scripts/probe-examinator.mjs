import vm from 'node:vm';
const url='https://raw.githubusercontent.com/ArchaiosMagister/examinator2/4ca31b4b2852f6b3ac0dc28c3f6ff3f2ad15d4a8/js/incluidos.js';
const res=await fetch(url);if(!res.ok)throw new Error('HTTP '+res.status);
const text=await res.text();
console.log('SOURCE HEADER',text.slice(0,300));console.log('BYTES',text.length);
const context={EXDATA:{},window:{},console};
vm.runInNewContext(text,context,{timeout:10000});
console.log('WINDOW KEYS',Object.keys(context.window));
const map=context.EXDATA||{};
console.log('DATA KEYS',Object.keys(map).length,Object.keys(map).filter(k=>k.includes('incluidos')).slice(0,20));
for(const key of Object.keys(map).filter(k=>k.includes('incluidos')).slice(0,3)){const value=map[key];console.log('INCLUDED',key,'TYPE',typeof value,'HEAD',String(value).slice(0,200));}
