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
  description: "Replace a search string with a replace string in a file.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to the file to read." },
      search_string: { type: "string", description: "String to search for in the file." },
      replace_string: { type: "string", description: "String to replace the search string with." },
    },
    required: ["file_path", "search_string", "replace_string"]
  },
  execute: withErrorHandling(({ file_path, search_string, replace_string }, cwd) => 
    fs.replaceInFile(resolvePath(file_path, cwd), search_string, replace_string)
  )
};

export let tools = [
  readFileTool,
  listFilesTool,
  writeFileTool,
  appendFileTool,
  replaceFileTool
];
