#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('Usage: node extract-code.js <raw.txt> <solution.js>');
  process.exit(2);
}

const raw = fs.readFileSync(input, 'utf8');
let code = raw;
const match = raw.match(/```(?:javascript|js|typescript|ts)?\s*([\s\S]*?)```/i);
if (match) code = match[1];

code = code.replace(/^\s+|\s+$/g, '') + '\n';
fs.writeFileSync(output, code);
