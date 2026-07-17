import { dom } from './lib/dom.js';
import { fs } from '../fs.js';
import { state, DEFAULT_CWD } from './state.js';

import * as cm from './lib/codemirror/codemirror.js';

const { basicSetup, EditorView, Vim, vim } = cm;
const { autocompletion } = cm.autocomplete;
const { EditorState } = cm.state;

let editorInstance: EditorView | null = null;
let cwdEditorInstance: EditorView | null = null;

const editorTheme = EditorView.theme({
  '& .cm-gutters': { backgroundColor: 'transparent', border: 'none' },
  '& .cm-gutter': { backgroundColor: 'transparent', color: 'white' },
  '& .cm-activeLineGutter': { backgroundColor: 'transparent' },
});

const makeFileOptions = (listing: string) => {
  return listing.split('\n').filter(Boolean).map((name) => {
    const isDir = name.endsWith('/');
    const label = isDir ? name.slice(0, -1) : name;
    return {
      label,
      apply: label + (isDir ? '/' : ''),
      type: isDir ? 'folder' : 'file',
    };
  });
};

const pathCompletions = async (context) => {
  const match = context.matchBefore(/\.\/[^\s]*/);
  if (!match) return null;

  const matchedText = context.state.sliceDoc(match.from, context.pos);
  const lastSlash = matchedText.lastIndexOf('/');
  const dirPart = matchedText.slice(0, lastSlash + 1);

  const cwd = state.sessionManager?.getHeader().cwd;
  const absDir = cwd + dirPart.slice(1);

  let listing: string;
  try {
    listing = await fs.listFiles(absDir);
  } catch {
    return null;
  }

  return {
    from: match.from + lastSlash + 1,
    options: makeFileOptions(listing),
    validFor: /^[^\s/]*$/,
  };
};

const cwdCompletions = async (context) => {
  const match = context.matchBefore(/\/[^\s]*/);
  if (!match) return null;

  const matchedText = context.state.sliceDoc(match.from, context.pos);
  const lastSlash = matchedText.lastIndexOf('/');
  const dirPart = matchedText.slice(0, lastSlash + 1) || '/';

  let listing: string;
  try {
    listing = await fs.listFiles(dirPart);
  } catch {
    return null;
  }

  return {
    from: match.from + lastSlash + 1,
    options: makeFileOptions(listing),
    validFor: /^[^\s/]*$/,
  };
};

export const createPromptEditor = (parent: HTMLElement) => {
  editorInstance = new EditorView({
    parent,
    state: EditorState.create({
      doc: '\n\n\n',
      extensions: [vim(), basicSetup, autocompletion({ override: [pathCompletions] }), editorTheme],
    }),
  });
  return editorInstance;
};

export const createCwdEditor = (parent: HTMLElement) => {
  cwdEditorInstance = new EditorView({
    parent,
    state: EditorState.create({
      doc: DEFAULT_CWD,
      extensions: [vim(), basicSetup, autocompletion({ override: [cwdCompletions] }), editorTheme],
    }),
  });
  return cwdEditorInstance;
};

export const getPromptEditor = () => editorInstance;
export const getCwdEditor = () => cwdEditorInstance;

export { Vim };
