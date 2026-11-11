const { execSync } = require('child_process');
const fs = require('fs');

let tscOutput = '';
try {
  execSync('npx tsc --noEmit --pretty false', { encoding: 'utf8' });
} catch (e) {
  tscOutput = e.stdout || e.stderr || '';
}

let eslintOutput = '';
try {
  execSync('npx eslint . --ext .ts,.tsx', { encoding: 'utf8' });
} catch (e) {
  eslintOutput = e.stdout || e.stderr || '';
}

console.log("=== TSC OUTPUT LINES ===");
console.log(tscOutput.trim());
console.log("\n=== ESLINT PROBLEMS ===");
console.log(eslintOutput.trim());
