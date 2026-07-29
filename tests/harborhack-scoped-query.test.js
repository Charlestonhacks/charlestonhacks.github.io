const fs=require('fs'); const vm=require('vm');
function assert(c,m){if(!c){throw new Error(m)}}

const app=fs.readFileSync('assets/js/harborhack/app.js','utf8');

// Extract the $/$$ helper definition line in isolation. These helpers must accept
// an optional scope/context argument and query against it instead of always
// falling back to `document` -- otherwise callers like initChecklist('#a',...) and
// initChecklist('#b',...) leak elements across containers (see harborhack-2026
// checklist/worksheet null textContent crash).
const helperMatch=app.match(/const \$=\([^;]*\), \$\$=\([^;]*\);/);
assert(helperMatch,'$/$$ helper definition found in app.js');
const helperSrc=helperMatch[0];

assert(/\$=\(s,\s*c\s*=\s*document\)\s*=>\s*c\.querySelector\(s\)/.test(helperSrc),
  '$ must query against its scope argument, not always document');
assert(/\$\$=\(s,\s*c\s*=\s*document\)\s*=>\s*Array\.from\(c\.querySelectorAll\(s\)\)/.test(helperSrc),
  '$$ must query against its scope argument, not always document');

// Behavioral check: evaluate just the helper snippet against fake document/element
// scopes and confirm a scoped call actually queries the passed-in scope.
const sandbox={
  document:{querySelector:()=>'FROM_DOCUMENT',querySelectorAll:()=>['FROM_DOCUMENT']},
};
// `const` bindings from a vm-executed script don't attach to the sandbox object;
// `var` bindings do. Only the declaration keyword changes here, not the logic.
vm.runInNewContext(helperSrc.replace(/^const /,'var '),sandbox);

const fakeContainer={querySelector:()=>'FROM_CONTAINER',querySelectorAll:()=>['FROM_CONTAINER']};

assert(sandbox.$('sel')==='FROM_DOCUMENT','$ with no scope defaults to document');
assert(sandbox.$('sel',fakeContainer)==='FROM_CONTAINER','$ with a scope queries that scope, not document');
assert(sandbox.$$('sel')[0]==='FROM_DOCUMENT','$$ with no scope defaults to document');
assert(sandbox.$$('sel',fakeContainer)[0]==='FROM_CONTAINER','$$ with a scope queries that scope, not document');

// Guard against regressing to the old single-arg form, which silently ignores a
// second argument instead of erroring, letting the bug reappear unnoticed.
assert(!/const \$=s=>document\.querySelector\(s\)/.test(app),
  '$ must not regress to the unscoped single-argument form');
assert(!/\$\$=s=>Array\.from\(document\.querySelectorAll\(s\)\)/.test(app),
  '$$ must not regress to the unscoped single-argument form');

console.log('HarborHack scoped-query regression test passed');
