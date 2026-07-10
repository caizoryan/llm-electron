import { fs } from '../fs.js';

const withErrorHandling = (fn) => async (...args) => {
  try {
    return { success: true, content: await fn(...args) };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/** Resolve a relative path against cwd; absolute paths pass through. */
const resolvePath = (p, cwd) => {
  if (!p) return p;
  if (p.startsWith('/')) return p;
  if (p.startsWith('./')) return cwd + '/' + p.slice(2);
  return cwd + '/' + p;
};

export const createTool = ({ name, description, parameters }) => ({
  type: 'function',
  function: { name, description, parameters }
});

export function toolToMarkdown(tool) {
  let markdown = `## ${tool.name}\n`;
  markdown += `**Description:** ${tool.description}\n\n`;
  markdown += "**Parameters:**\n";
  for (const [param, details] of Object.entries(tool.parameters.properties)) {
    markdown += `- **${param}** (${details.type}): ${details.description}\n`;
    if (tool.parameters.required.includes(param)) {
      markdown += `  - *Required*\n`;
    }
  }
  return markdown;
}

export const readFileTool = {
  name: "read",
  description: "Read the contents of a file from the local filesystem.",
  parameters: {
    type: "object",
    properties: { file_path: { type: "string", description: "Path to the file to read." } },
    required: ["file_path"]
  },
  execute: withErrorHandling(({ file_path }, cwd) => fs.readFile(resolvePath(file_path, cwd)))
};

export const writeFileTool = {
  name: "write",
  description: "Create a file with the provided content.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Absolute or relative file path." },
      content: { type: "string", description: "Content to write into the file." },
    },
    required: ["file_path", "content"]
  },
  execute: withErrorHandling(({ file_path, content }, cwd) => fs.writeFile(resolvePath(file_path, cwd), content))
};

export const listFilesTool = {
  name: "list",
  description: "List the contents of a directory from the local filesystem.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Path to the directory to list." } },
    required: ["path"]
  },
  execute: withErrorHandling(({ path }, cwd) => fs.listFiles(resolvePath(path, cwd)))
};

export const appendFileTool = {
  name: "append",
  description: "Append content to the end of a file.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to the file to append to." },
      content: { type: "string", description: "Content to append to the file." },
    },
    required: ["file_path", "content"]
  },
  execute: withErrorHandling(({ file_path, content }, cwd) => fs.appendFile(resolvePath(file_path, cwd), content))
};

export const replaceFileTool = {
  name: "replace",
  description: "Replace one or more search strings in a file.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to the file to modify." },
      changes: {
        type: "array",
        description: "Array of replacements to apply.",
        items: {
          type: "object",
          properties: {
            search_string: { type: "string", description: "String to search for." },
            replace_string: { type: "string", description: "String to replace it with." },
          },
          required: ["search_string", "replace_string"]
        }
      }
    },
    required: ["file_path", "changes"]
  },
  execute: withErrorHandling(({ file_path, changes }, cwd) =>
    fs.replaceInFile(resolvePath(file_path, cwd), changes)
  )
};

export const renderHtmlTool = {
  name: "render-html",
  description: "Render an HTML element by providing a JavaScript function as a string. The function must return an HTMLElement. Example: (function(){ var el = document.createElement('div'); el.textContent = 'hello'; return el; })",
  parameters: {
    type: "object",
    properties: {
      func: {
        type: "string",
        description: "A JavaScript function as a string that returns an HTMLElement."
      }
    },
    required: ["func"]
  },
  execute: async ({func}) => {
      try {
        // eslint-disable-next-line no-eval
        const fn = eval(func);

        if (typeof fn === 'function') {
          const el = fn();
          if (el instanceof HTMLElement) { 
						return "successfully renderers"
					}
				}
			} catch (err) {
				return err.message
			}
	}
}

export const renderInteractiveQuestionTool = {
  name: "render-interactive-question",
  description: `Render an interactive HTML question in the chat.

Provide a JavaScript function as a string. The function receives two arguments:
- library: an object exposing { dom, reactive, memo }
- callback: a function you call with a string answer when the user submits

The function must return an HTMLElement. The callback validates the answer is a string and appends it to the user's prompt box for them to send.

Example 1 - dom() only:
(function(lib, callback) {
  var input = lib.dom(['input', { placeholder: 'Type a color' }]);
  var button = lib.dom(['button', {
    onclick: function() { callback('The chosen color is: ' + input.value); }
  }, 'Send']);
  return lib.dom(['div', input, button]);
})

Example 2 - reactive():
(function(lib, callback) {
  var count = lib.reactive(0);
  return lib.dom(['div',
    lib.memo(function() { return ['span', 'Count: ' + count.value()]; }, [count]),
    ['button', { onclick: function() { count.next(function(v) { return v + 1; }); } }, '+'],
    ['button', { onclick: function() { callback('Final count: ' + count.value()); } }, 'Submit']
  ]);
})

Example 3 - memo():
(function(lib, callback) {
  var width = lib.reactive(5);
  var height = lib.reactive(5);
  var area = lib.memo(function() {
    return 'Area = ' + (width.value() * height.value());
  }, [width, height]);
  return lib.dom(['div',
    ['input', { type: 'number', value: '5', oninput: function(e) { width.next(function() { return parseInt(e.target.value); }); } }],
    ['input', { type: 'number', value: '5', oninput: function(e) { height.next(function() { return parseInt(e.target.value); }); } }],
    lib.memo(function() { return ['p', area.value()]; }, [area]),
    ['button', { onclick: function() { callback('Dimensions: ' + width.value() + ' x ' + height.value()); } }, 'Send']
  ]);
})`,
  parameters: {
    type: "object",
    properties: {
      func: {
        type: "string",
        description: "A JavaScript function as a string. Signature: (library, callback) => HTMLElement. library = { dom, reactive, memo }. callback = (answer: string) => void."
      }
    },
    required: ["func"]
  },
  execute: async ({ func }) => {
    try {
      // eslint-disable-next-line no-eval
      const fn = eval(func);
      if (typeof fn === 'function') {
        return "interactive question rendered";
      }
    } catch (err) {
      return err.message;
    }
  }
};

export let tools = [
  readFileTool,
  listFilesTool,
  writeFileTool,
  appendFileTool,
  replaceFileTool,
  renderHtmlTool,
  renderInteractiveQuestionTool
];
