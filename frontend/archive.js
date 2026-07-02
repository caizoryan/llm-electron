const updateOutput = (output, result, filePath) => {
  if (result.success) {
    output.value = result.content;
    currentPath = filePath;
  } else {
    output.value = `Error: ${result.error}`;
  }
};

const handleReadFile = async (input, output) => {
  const filePath = input.value;
  output.textContent = 'Loading...';

  const result = await readFile(filePath);
  updateOutput(output, result, filePath);
};


let output = dom("textarea#output", { 
	style: "margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 5px; white-space: pre-wrap; word-wrap: break-word;",
	onkeypress: (e) => {
		if (e.key == 'Enter' && currentPath){
			e.preventDefault()
			writeFile(currentPath, output.value)
		}
	},
}, "File contents will appear here...")

const content = dom([
  "div",
  ["h2", "File Reader"],
  ["input#fileInput", {
    placeholder: "Enter file path",
    type: "text",
    onkeypress: (e) => {
      if (e.key === 'Enter') {
        handleReadFile(e.target, document.getElementById('output'));
      }
    }
  }],
  output
]);
