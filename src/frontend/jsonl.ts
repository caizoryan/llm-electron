import { Message } from '../sessionTypes.ts'

function parse(jsonl:string) : any[] {
  return jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function stringify(rows: Message[]) : string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

export const JSONL = { parse, stringify };
