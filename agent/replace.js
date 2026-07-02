function readFileRange(filePath, fromLine, toLine) {
	let content = fs.readFileSync(filePath, {encoding: 'utf8'})

	if (!fromLine || fromLine < 1) return content;

	content = content.split('\n');


	const startIndex = Math.max(0, parseInt(fromLine) - 1); // Convert line number to index
	const end = parseInt(toLine) + 1;

	return content.slice(startIndex, end).join('\n');
}

export const replaceTemplate = (inputString) => {
	const tokens=inputString.split(' ');
	const prefix='/readfile:';
	let modelPrefix = '/model:'; // Defined explicitly for clarity
	let resultString='';

	for (const token of tokens){

		if (token.includes(modelPrefix)){
			const startIndex = token.indexOf(modelPrefix);
			let modelNameCandidate = token.substring(startIndex + modelPrefix.length).trim();

			if (models[modelNameCandidate]) {
				const newModelKey = modelNameCandidate;
				if (currentModel !== models[newModelKey]) {
					console.log(`Setting current model from ${currentModel} to ${models[newModelKey]} based on input token.`);
					currentModel = models[newModelKey];
				}
			}
		}

		else if (token.includes(prefix)){
			const startIndex = token.indexOf(prefix);
			let before = token.slice(0, startIndex)
			let filePath = token.substring(startIndex + prefix.length).trim();

			if (filePath){
				let lineStart = -1
				let lineEnd = -1
				// check if there is a line numbers
				try {
					let split = filePath.split(':')
					if (split.length > 1){
						filePath = split[0]
						let numbers = split[1].split('-')
						lineStart = numbers[0]
						lineEnd = numbers[1]
					}
					const fileContent = readFileRange(filePath, lineStart, lineEnd);
					resultString += (before + fileContent)
				} catch(error){
					console.error(`Errorreadingfile${filePath}:`,error);
					resultString+=`[ERRORREADINGFILE:${filePath}]`;
				}
			}
		} else {
			resultString+=token + " ";
		}
	}

	return resultString;
};
