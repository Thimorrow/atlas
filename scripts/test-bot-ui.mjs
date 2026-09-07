// Isolated browser regression checks: original components, mocked school APIs.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const root = new URL('../', import.meta.url).pathname;
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {BotLauncher} from '@/components/bot-launcher'; import {ToastProvider} from '@/components/toast';
const id='11111111-1111-4111-8111-111111111111';
const user={id:'u',role:'user',content:'Alte Frage',toolName:null,toolArgs:null,toolResult:null};
window.fixture={history:'Alte Antwort',failInfo:false,posts:[],aborted:0};
localStorage.setItem('atlas:bot-conversation-id',id);
window.fetch=async(url,init)=>{
 const f=window.fixture;
 if(url==='/api/bot'&&init?.method==='POST'){
   f.posts.push(JSON.parse(init.body));
   return new Response(new ReadableStream({start(c){
     c.enqueue(new TextEncoder().encode(JSON.stringify({type:'conversation',conversationId:id})+'\\n'));
     const timer=setInterval(()=>c.enqueue(new TextEncoder().encode(JSON.stringify({type:'text',delta:'Noch ein Absatz.\\n\\n'})+'\\n')),30);
     init.signal.addEventListener('abort',()=>{clearInterval(timer);f.aborted++;c.close()});
   }}));
 }
 if(String(url).startsWith('/api/bot/proposals/')){ f.decision=JSON.parse(init.body); f.proposalState=f.decision.decision==='accept'?'entered':'discarded';return Response.json({state:f.proposalState}); }
 if(url==='/api/bot')return Response.json(f.failInfo?{error:'offline'}:{enabled:true,greeting:'Hallo',suggestions:[],conversationId:null},{status:f.failInfo?503:200});
 if(String(url).startsWith('/api/bot/verlauf/'))return Response.json({conversation:{id},messages:[user,{...user,id:'a',role:'assistant',content:f.history},...(f.proposalState?[{...user,id:'proposal-id',role:'tool',content:'',toolName:'note_vorschlagen',proposalState:f.proposalState,toolResult:{vorschlag:{fach:'Mathe',subjectId:id,punkte:12,note:'2+',art:'written',bezeichnung:'Probe',datum:'2026-09-07',gewicht:1}}}]:[])]});
 return Response.json({});
};
createRoot(document.getElementById('root')).render(<ToastProvider><button id="opener" onClick={()=>window.dispatchEvent(new Event('atlas:bot-toggle'))}>Öffnen</button><BotLauncher/></ToastProvider>);`;
const output = await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,jsx:'automatic',platform:'browser',tsconfig:root+'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-adapters',setup(b){b.onResolve({filter:/^next\/(link|dynamic|navigation)$/},a=>({path:a.path,namespace:'next-ui'}));b.onLoad({filter:/.*/,namespace:'next-ui'},a=>({loader:'jsx',resolveDir:root,contents:a.path==='next/link'?"import React from 'react';export default function Link(p){return <a {...p}/>}":a.path==='next/navigation'?"export const usePathname=()=>'/';":"import React from 'react';export default function dynamic(load){const C=React.lazy(()=>load().then(defaultExport=>({default:defaultExport})));return props=><React.Suspense fallback={null}><C {...props}/></React.Suspense>}"}));}}]});
const css=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(await readFile(root+'app/globals.css','utf8'),{from:root+'app/globals.css'});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:560}});
 await page.route('https://atlas-ui.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div></html>'}));
 await page.goto('https://atlas-ui.test');
 await page.addStyleTag({content:css.css});
 await page.addScriptTag({content:output.outputFiles[0].text});
 await page.locator('#opener').click();
 await expect(page.getByText('Alte Antwort',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Nachricht an Atlas'})).toBeFocused();
 await page.getByRole('button',{name:'Schließen',exact:true}).click();
 await expect(page.locator('#opener')).toBeFocused();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.evaluate(()=>window.fixture.history='Frische Antwort');
 await page.locator('#opener').click();
 await expect(page.getByText('Frische Antwort',{exact:true})).toBeVisible();
 await page.waitForTimeout(350);
 const box=await page.getByRole('button',{name:'Absenden',exact:true}).boundingBox();
 if(box.width<44||box.height<44)throw new Error('Send target below 44px');
 const dialog=await page.getByRole('dialog').boundingBox();
 if(dialog.height<450||dialog.y<0||dialog.y+dialog.height>560)throw new Error('Short mobile viewport not used');
 await page.getByRole('textbox').fill('Test');
 await page.getByRole('button',{name:'Absenden',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.fixture.posts.length)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>document.querySelector('[data-bot-chat] .overflow-y-auto').scrollHeight)).toBeGreaterThan(750);
 await page.evaluate(()=>{const el=document.querySelector('[data-bot-chat] .overflow-y-auto');el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
 await page.waitForTimeout(200);
 const top=await page.evaluate(()=>document.querySelector('[data-bot-chat] .overflow-y-auto').scrollTop);
 if(top!==0)throw new Error('Streaming moved the reader');
 await page.getByRole('button',{name:'Schließen',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.fixture.aborted)).toBe(1);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.locator('#opener').click();
 await page.evaluate(()=>window.fixture.failInfo=true);
 await page.getByRole('button',{name:'Neuen Chat starten'}).click();
 await expect(page.getByText('Der Chat konnte nicht geladen werden.',{exact:false})).toBeVisible();
 await page.getByRole('textbox').fill('Neu');
 await page.getByRole('button',{name:'Absenden',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.fixture.posts.length)).toBe(2);
 const sent=await page.evaluate(()=>window.fixture.posts[1]);
 if(sent.conversationId!==null)throw new Error('New chat reused old conversation after GET failure');
 await page.getByRole('button',{name:'Antwort abbrechen'}).click();
 await page.getByRole('button',{name:'Schließen',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.evaluate(()=>{window.fixture.failInfo=false;window.fixture.proposalState='entered'});
 await page.locator('#opener').click();
 await expect(page.getByText('Eingetragen.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Eintragen',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Schließen',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.evaluate(()=>window.fixture.proposalState='pending');
 await page.locator('#opener').click();
 await page.getByRole('button',{name:'Verwerfen',exact:true}).click();
 await expect(page.getByText('Verworfen.',{exact:true})).toBeVisible();
 const decision=await page.evaluate(()=>window.fixture.decision);
 if(decision.decision!=='discard')throw new Error('Discard not persisted');
 console.log('PASS: persisted proposal restore and discard, cache refresh, cached stream cleanup, new-chat isolation, reader scroll, input label, focus return, 44px targets, short mobile layout');
} finally {await browser.close();}
