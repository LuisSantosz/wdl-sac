import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../dist/panel.css',import.meta.url),'utf8');
function tokens(pattern){return Object.fromEntries([...css.match(pattern)[1].matchAll(/(--[\w-]+):([^;]+);/g)].map(match=>[match[1],match[2].trim()]));}
function luminance(hex){const raw=hex.slice(1),full=raw.length===3?[...raw].map(c=>c+c).join(''):raw;const rgb=[0,2,4].map(i=>parseInt(full.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
for(const [theme,pattern] of [['claro',/:root\{([^}]+)\}/],['escuro',/:root\[data-theme=dark\]\{([^}]+)\}/]]){
 test('contraste de texto e estados no tema '+theme,()=>{
  const t=tokens(pattern);
  for(const [text,bg] of [['--text','--bg'],['--text','--surface'],['--muted','--surface'],['--muted','--surface-2'],['--primary-text','--blue'],['--blue','--total-bg'],['--red','--rbg'],['--yellow','--ybg'],['--green','--gbg'],['--copper','--copper-bg'],['--sidebar-text','--sidebar'],['--sidebar-muted','--sidebar']]){
   const score=contrast(t[text],t[bg]);assert.ok(score>=4.5,`${text} sobre ${bg}: ${score.toFixed(2)}:1`);
  }
 });
}
