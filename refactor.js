const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'client', 'src', 'components', 'BlackjackTable.tsx');
let content = fs.readFileSync(p, 'utf-8');

const startStr = '// Chip catalogue. Rounds (<1000) are circles; plaques (>=1000) are rectangles.';
const endStr = '  const customCols = createColumns(customs, 1, 2);\n\n  const renderCol = (col: ChipDenom[][], prefix: string, colIndex: number) => (\n    <motion.div layout key={`${prefix}-col-${colIndex}`} className="grid">\n      {col.map((chunk, i) => (\n        <div \n          key={`${prefix}-chunk-${i}`} \n          className="col-start-1 row-start-1 flex items-end justify-center" \n          style={{ marginBottom: (col.length - 1 - i) * (prefix === \'customs\' ? 44 : 34) + (prefix === \'customs\' ? 14 : 0), zIndex: i }}\n        >\n          <ChipPile items={chunk} size={size} />\n        </div>\n      ))}\n    </motion.div>\n  );\n\n  return (\n    <motion.div layout className="flex items-end justify-center gap-1.5">\n      {roundCols.map((col, i) => renderCol(col, \'rounds\', i))}\n      {plaqueCols.map((col, i) => renderCol(col, \'plaques\', i))}\n      {largeCols.map((col, i) => renderCol(col, \'larges\', i))}\n      {customCols.map((col, i) => renderCol(col, \'customs\', i))}\n    </motion.div>\n  );\n};';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr) + endStr.length;

if (startIndex > -1 && endIndex > -1) {
  content = content.substring(0, startIndex) + content.substring(endIndex);
  const imports = `import type { ChipDenom } from './Chips';\nimport { CHIP_DEFS, CHIP_PAGES, CHIP_PAGE_VALUES, defByValue, chipsFromAmount, Chip, CustomChipControl, ChipRail, ChipPile, ChipStack, pageForAmount } from './Chips';\n`;
  content = content.replace("import type { Room, Player, Card } from '../../../shared/types';", "import type { Room, Player, Card } from '../../../shared/types';\n" + imports);
  fs.writeFileSync(p, content);
  console.log('Modified BlackjackTable.tsx successfully.');
} else {
  console.log('Could not find start/end markers.');
}
