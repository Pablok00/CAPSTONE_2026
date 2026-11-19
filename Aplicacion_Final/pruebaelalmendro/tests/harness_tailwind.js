const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');let n=0;function check(s,v){assert.ok(v,s);n++;console.log('PASS '+s);}
const css=fs.readFileSync('css/tailwind.css','utf8');
check('CSS generado contiene preflight y utilidades',css.includes('box-sizing:border-box')&&css.includes('.hidden{display:none}')&&css.includes('.flex{display:flex}'));
for(const cls of ['dark:bg-slate-900','sm:grid-cols-2','lg:grid-cols-3','z-[90]','max-w-[95vw]','line-clamp-2']){const escaped=cls.replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c);check('Clase de interfaz incluida: '+cls,css.includes('.'+escaped));}
check('Paleta brand original incluida',css.includes('.bg-brand-')||!['index.html','login.html','recuperar-password.html'].some(f=>/class=["'][^"']*bg-brand-/.test(fs.readFileSync(f,'utf8'))));
for(const f of ['index.html','login.html','recuperar-password.html']){const s=fs.readFileSync(f,'utf8');check(f+' sin compilador CDN y con CSS local antes de estilos propios',!s.includes('cdn.tailwindcss.com')&&!s.includes('tailwind.config')&&s.indexOf('./css/tailwind.css')<s.indexOf('./css/styles.css'));for(const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/\bsrc=/.test(m[1]))new vm.Script(m[2]);}check(f+' copia pública idéntica',fs.readFileSync('publicacion/'+f).equals(fs.readFileSync(f)));}
check('CSS público idéntico',fs.readFileSync('publicacion/css/tailwind.css').equals(fs.readFileSync('css/tailwind.css')));
check('Herramientas de generación fuera de publicación',!fs.existsSync('publicacion/tools'));
console.log(n+'/'+n+' PASS — Tailwind local y sintaxis de scripts inline');
