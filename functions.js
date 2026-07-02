import fs from 'fs';

export default  {
	readFile: async (event, [filePath]) => {
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			return { success: true, content };
		} catch (error) {
			return { success: false, error: error.message };
		}
	},

	writeFile: async (event, [filePath,content]) => {
		try {
			fs.writeFileSync(filePath, content, 'utf-8');
			return { success: true };
		} catch (error) {
			return { success: false, error: error.message };
		}
	},

	listFiles: async (event, [directoryPath]) => {
		try {
			const files = fs.readdirSync(directoryPath, {withFileTypes: true})
        .map(e => e.isDirectory() ? `${e.name}/` : e.name)
        .join("\n")
			return { success: true, files };
		} catch (error) {
			return { success: false, error: error.message };
		}
	}
}
