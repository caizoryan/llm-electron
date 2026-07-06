import fs from 'fs';

export default  {
		/**
		 * Reads the first `numLines` lines from a file using a raw read stream.
		 * Stops reading as soon as enough lines are collected.
		 *
		 * @param {string} filePath
		 * @param {number} numLines
		 * @returns {Promise<string[]>}
		 */
	  readFirstNLines:(filePath, numLines) => {
			return new Promise((resolve, reject) => {
			const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
			let leftover = '';
			const lines = [];
			let done = false;

			stream.on('data', (chunk) => {
				if (done) return;

				leftover += chunk;
				let newlineIndex;

				// Extract as many complete lines as we can from the buffer
				while ((newlineIndex = leftover.indexOf('\n')) !== -1) {
					const line = leftover.slice(0, newlineIndex);
					leftover = leftover.slice(newlineIndex + 1);

					lines.push(line);

					if (lines.length >= numLines) {
						done = true;
						stream.destroy(); // stop reading from disk immediately
						resolve({ success: true, lines });
						return;
					}
				}
			});

			stream.on('end', () => {
				if (done) return;
				// file ended before we hit numLines — push any trailing partial line
				if (leftover.length > 0) {
					lines.push(leftover);
				}
				resolve({ success: true, lines });
			});

			stream.on('error', (error) => {
				reject({ success: false, error: error.message });
			});
		});
	},

	readFile: async (event, [filePath]) => {
		try {
			const stats = fs.statSync(filePath);
			const MAX_FILE_SIZE = 1024 * 1024; // 1MB
			
			if (stats.size > MAX_FILE_SIZE) {
				return { 
					success: false, 
					error: 'File too large to read (max 1MB)' 
				};
			}
			
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
