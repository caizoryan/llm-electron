import markdownIt from "./lib/markdown-it/markdown-it.js";
import markdownItMark from "./lib/markdown-it/markdown-it-mark.js";

import { Prism } from './lib/prism.js';

console.log("HELLO FUCKING WORD")

// ********************************
// SECTION : MARKDOWN RENDERING
// ********************************
// let md = new markdownIt('commonmark').use(markdownItMark);
let md = new markdownIt().use(markdownItMark);

let attrs = (item) => {
	let attrs = item.attrs;
	if (!attrs) return {};
	return Object.fromEntries(attrs);
};

function eat(tree) {
	let ret = [];

	if (!tree) return "";

	while (tree.length > 0) {
		let item = tree.shift();
		if (item.nesting === 1) {
			let at = attrs(item);
			let ignore = false;
			if (at.href) at.target = "_blank";

			if (!ignore) {
				let children = eat(tree);
				ret.push([item.tag, at, ...children]);
			}
		}
		if (item.nesting === 0) {
			if (!item.children || item.children.length === 0) {
				let p = item.type === "softbreak"
					? ["br"]
					: item.type === "fence"
						? highlightedCodeBlock(item) // ["pre", item.content]
						: item.type === "code_inline"
							? [item.tag, item.content]
							: item.content;
				ret.push(p);
			} else {
				let children = eat(item.children);
				children.forEach((e) => ret.push(e));
			}
		}

		if (item.nesting === -1) break;
	}

	return ret;
}
function highlightedCodeBlock(item) {
	console.log(item)
	const lang = item.info ? item.info.trim().split(/\s+/)[0] : '';
	const code = item.content;

	const pre = document.createElement('pre');
	const codeEl = document.createElement('code');

	if (lang) {
		codeEl.classList.add(`language-${lang}`);
		pre.classList.add(`language-${lang}`);
	}

	if (lang && Prism.languages[lang]) {
		codeEl.innerHTML = Prism.highlight(code, Prism.languages[lang], lang);
	} else {
		codeEl.textContent = code;
	}

	pre.appendChild(codeEl);
	return pre;
}

let safe_parse = (content) => {
	try {
		return md.parse(content, { html: true });
	} catch (e) {
		return undefined;
	}
};

let debug_print = false;
export const MD = (content) => {
	let tree, body;
	tree = safe_parse(content);
	if (tree) body = eat(tree);
	else body = content;
	return body;
};
