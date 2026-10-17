// Склеивает результат vite (dist-single) в один файл play.html: HTML + CSS + JS внутри.
import fs from 'node:fs';
import path from 'node:path';
const dir = new URL('../dist-single/', import.meta.url).pathname;
let html = fs.readFileSync(dir + 'index.html', 'utf8');
const read = (p) => fs.readFileSync(path.join(dir, p.replace(/^\.\//, '')), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (m, h) => `<style>${read(h)}</style>`);
let js = '';
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (m, s) => { js = read(s); return ''; });
html = html.replace('</body>', () => `<script>${js.replace(/<\/script>/g, '<\\/script>')}</script></body>`);
const out = process.env.MOBILE === '1' ? 'play-mobile.html' : 'play.html';
fs.writeFileSync(new URL('../' + out, import.meta.url), html);
console.log(out + ':', (html.length / 1024).toFixed(0), 'КБ');
