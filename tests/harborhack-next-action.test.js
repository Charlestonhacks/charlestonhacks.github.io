const fs=require('fs'); const vm=require('vm');
function assert(c,m){if(!c){throw new Error(m)}}

const page=fs.readFileSync('harborhack-2026/index.html','utf8');
const app=fs.readFileSync('assets/js/harborhack/app.js','utf8');

// Contract: the HTML must expose a dedicated, order-independent hook for the
// recommendation detail paragraph inside #next-action, and app.js must target
// that hook rather than picking "the first <p>" (which used to match the
// eyebrow instead of the intended trailing paragraph).
assert(page.includes('id="next-action"><p class="eyebrow">What should I do next?</p><h3>Loading recommendation…</h3><p data-detail></p></div>'),
  '#next-action markup exposes a data-detail hook for the recommendation paragraph');

assert(!/box\.querySelector\('p'\)\.textContent=r/.test(app),
  'initNext must not regress to selecting the first untargeted <p>');
assert(/box\.querySelector\('\[data-detail\]'\)\.textContent=r/.test(app),
  'initNext must target the recommendation paragraph via [data-detail]');

// Behavioral check: extract the real initNext() body by brace-matching (so the
// test runs against the actual current source, not a copy) and execute it
// against a minimal fake #next-action box that mirrors the real markup order:
// eyebrow <p>, then <h3>, then the data-detail <p>.
function extractFunction(src,name){
  const start=src.indexOf('function '+name+'(');
  assert(start!==-1,name+' found in app.js');
  const bodyStart=src.indexOf('{',start);
  let depth=0,i=bodyStart;
  for(;i<src.length;i++){
    if(src[i]==='{')depth++;
    else if(src[i]==='}'){depth--; if(depth===0)break;}
  }
  return src.slice(start,i+1);
}
const initNextSrc=extractFunction(app,'initNext');

function makeNextActionBox(){
  const eyebrow={tagName:'P',attrs:{},textContent:'What should I do next?'};
  const h3={tagName:'H3',attrs:{},textContent:'Loading recommendation…'};
  const detail={tagName:'P',attrs:{'data-detail':''},textContent:''};
  const children=[eyebrow,h3,detail];
  function matches(el,selector){
    if(selector[0]==='['){return Object.prototype.hasOwnProperty.call(el.attrs,selector.slice(1,-1));}
    return el.tagName===selector.toUpperCase();
  }
  return {eyebrow,h3,detail,querySelector(selector){return children.find(el=>matches(el,selector))||null;}};
}

const box=makeNextActionBox();
const sandbox={
  $:(sel)=>sel==='#next-action'?box:null,
  storage:(k,fallback)=>fallback,
  has:(s)=>!!(s&&String(s).trim()),
  localStorage:{getItem:()=>null},
  recommend:()=>['Test Heading','Test Detail'],
};
vm.runInNewContext('var initNext='+initNextSrc+';',sandbox);
sandbox.initNext();

assert(box.eyebrow.textContent==='What should I do next?','eyebrow text is left untouched');
assert(box.h3.textContent==='Test Heading','recommendation heading renders in <h3>');
assert(box.detail.textContent==='Test Detail','recommendation detail renders in the data-detail paragraph, not the eyebrow');

console.log('HarborHack next-action regression test passed');
