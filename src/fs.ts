// Common filesystem module for Electron renderer process
export const fs = {
	readFirstNLines: async (path, num) => {
	  const result = await window.electronAPI.readFirstNLines([path, num]);
	  if (result.success) return result.lines;
	  throw new Error(result.error);
	},
  readFile: async (path) => {
		console.log("reading", path)
    const result = await window.electronAPI.readFile([path]);
    if (result.success) return result.content;
    throw new Error(result.error);
  },
  
  writeFile: async (path, content) => {
    const result = await window.electronAPI.writeFile([path, content]);
    if (!result.success) throw new Error(result.error);
    return `bytesWritten: ${content.length}`;
  },
  
  listFiles: async (path) => {
		console.log("listing", path)
    const result = await window.electronAPI.listFiles([path]);
    if (result.success) return result.files
    throw new Error(result.error);
  },
  
  appendFile: async (path, content) => {
    const result = await window.electronAPI.appendFile([path, content]);
    if (!result.success) throw new Error(result.error);
    return `bytesAppended: ${Buffer.byteLength(content)}`;
  },
  
  replaceInFile: async (path, changes) => {
    let content = await fs.readFile(path);
    for (const { search_string, replace_string } of changes) {
      content = content.replace(search_string, replace_string);
    }
    await fs.writeFile(path, content);
    return 'Successfully replaced';
  }
};
