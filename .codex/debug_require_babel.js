try {
  require('../node_modules/@babel/helper-optimise-call-expression/node_modules/@babel/types/lib/index.js')
  console.log('ok')
} catch (e) {
  console.error(e && e.stack ? e.stack : e)
  process.exit(1)
}
