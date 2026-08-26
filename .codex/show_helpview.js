const fs = require('fs')
const lines = fs.readFileSync('apps/miniprogram/src/pages/main/main.tsx', 'utf8').split(/\r?\n/)
for (let i = 266; i < 286; i += 1) {
  if (lines[i] !== undefined) {
    console.log(String(i + 1).padStart(4, ' ') + ': ' + lines[i])
  }
}
