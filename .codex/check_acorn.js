const acorn = require('../node_modules/acorn');
const assertions = require('../node_modules/acorn-import-assertions');
console.log('acorn version:', require('../node_modules/acorn/package.json').version);
console.log('parser extend:', typeof acorn.Parser?.extend);
console.log('importAssertions:', typeof assertions.importAssertions);
try {
  const parser = acorn.Parser.extend(assertions.importAssertions);
  console.log('extend result:', typeof parser.parse);
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
