const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const lucide = require('lucide-react');
const sharp = require(process.env.SHARP_MODULE_PATH || path.join(
  process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp',
));
const names = {
  home: 'House', report: 'FileText', siren: 'Siren', mapPin: 'MapPin',
  chevronRight: 'ChevronRight', chevronDown: 'ChevronDown', search: 'Search',
  shield: 'ShieldCheck', book: 'BookOpen', clock: 'Clock3', user: 'UserRound',
  arrowLeft: 'ArrowLeft', arrowUpRight: 'ArrowUpRight', camera: 'Camera',
  mic: 'Mic', phone: 'Phone', check: 'Check', close: 'X', refresh: 'RotateCcw',
  send: 'Send', navigation: 'Navigation', tasks: 'ClipboardList',
  briefcase: 'BriefcaseBusiness', flag: 'Flag', location: 'LocateFixed',
  image: 'ImagePlus', info: 'Info', logout: 'LogOut', eye: 'Eye',
  eyeOff: 'EyeOff', link: 'Link', plus: 'Plus', video: 'Video',
  settings: 'Settings2', volume: 'Volume2',
};
const tones = {
  blue: '#0d7ff9', muted: '#71849b', danger: '#eb4651', green: '#17886d',
  amber: '#b57c25', white: '#ffffff', ink: '#20354d',
};
const output = path.resolve(__dirname, '../src/assets/icons');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const imports = [];
  const mapping = [];
  for (const [name, glyph] of Object.entries(names)) {
    const colors = [];
    for (const [tone, color] of Object.entries(tones)) {
      const key = `${name}_${tone}`;
      const svg = renderToStaticMarkup(React.createElement(lucide[glyph], {
        xmlns: 'http://www.w3.org/2000/svg', size: 96, color, strokeWidth: 1.8,
      }));
      await sharp(Buffer.from(svg)).png().toFile(path.join(output, `${key}.png`));
      imports.push(`import ${key} from './${key}.png'`);
      colors.push(`'${tone}': ${key}`);
    }
    mapping.push(`  '${name}': { ${colors.join(', ')} }`);
  }
  fs.writeFileSync(path.join(output, 'icon-assets.ts'),
    `// Generated from Lucide. Run scripts/generate-icons.cjs to regenerate.\n${imports.join('\n')}\n\nexport const iconAssets: Record<string, Record<string, string>> = {\n${mapping.join(',\n')}\n}\n`);
  console.log(`Generated ${Object.keys(names).length * Object.keys(tones).length} native icons.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
