function parse(jsonl) {
  return jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function stringify(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

export const JSONL = { parse, stringify };