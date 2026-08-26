const acorn = require('../node_modules/acorn');
const espree = require('../node_modules/espree');
console.log('acorn keys:', Object.keys(acorn));
console.log('acorn __esModule:', acorn.__esModule);
console.log('acorn Parser:', typeof acorn.Parser, 'extend:', typeof acorn.Parser?.extend);
console.log('espree version:', espree.version);
try {
  console.log(espree.parse('const x = <View />', { ecmaVersion: 'latest', ecmaFeatures: { jsx: true } }).type);
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
