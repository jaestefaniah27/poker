const fs = require('fs');

let content = fs.readFileSync('client/src/components/Chips.tsx', 'utf8');

const toRemove = `  { v: 10000000, color: '#10b981', ring: '#064e3b', label: '10M', premium: 'diamond' },\r
  { v: 50000000, color: '#3b82f6', ring: '#1e3a8a', label: '50M', premium: 'diamond' },\r
  { v: 100000000, color: '#ec4899', ring: '#831843', label: '100M', premium: 'diamond'},\r
  { v: 500000000, color: '#000000', ring: '#ffffff', label: '500M', premium: 'diamond'},\r
  { v: 1000000000, color: '#facc15', ring: '#854d0e', label: '1B', premium: 'diamond'},\r
  { v: 5000000000, color: '#ef4444', ring: '#7f1d1d', label: '5B', premium: 'diamond'}\r
];`;
const toRemove_alt = `  { v: 10000000, color: '#10b981', ring: '#064e3b', label: '10M', premium: 'diamond' },\n  { v: 50000000, color: '#3b82f6', ring: '#1e3a8a', label: '50M', premium: 'diamond' },\n  { v: 100000000, color: '#ec4899', ring: '#831843', label: '100M', premium: 'diamond'},\n  { v: 500000000, color: '#000000', ring: '#ffffff', label: '500M', premium: 'diamond'},\n  { v: 1000000000, color: '#facc15', ring: '#854d0e', label: '1B', premium: 'diamond'},\n  { v: 5000000000, color: '#ef4444', ring: '#7f1d1d', label: '5B', premium: 'diamond'}\n];`;

if (content.includes(toRemove)) {
  content = content.replace(toRemove, '];');
} else if (content.includes(toRemove_alt)) {
  content = content.replace(toRemove_alt, '];');
} else {
  // Use regex
  content = content.replace(/  \{ v: 10000000, color.*\];/s, '];');
}

const pagesToRemove = `  [5000000, 10000000, 50000000, 100000000, 500000000],\r
  [100000000, 500000000, 1000000000, 5000000000]\r
];`;
const pagesToRemove_alt = `  [5000000, 10000000, 50000000, 100000000, 500000000],\n  [100000000, 500000000, 1000000000, 5000000000]\n];`;

if (content.includes(pagesToRemove)) {
  content = content.replace(pagesToRemove, '];');
} else if (content.includes(pagesToRemove_alt)) {
  content = content.replace(pagesToRemove_alt, '];');
} else {
  content = content.replace(/  \[5000000, 10000000, 50000000, 100000000, 500000000\].*\];/s, '];');
}

content = content.replace('if (amount < 10000000) return 4;\r\n  if (amount < 200000000) return 5;\r\n  return 6;', 
  'if (amount < 120000000) return 4;\r\n  return 5;');
content = content.replace('if (amount < 10000000) return 4;\n  if (amount < 200000000) return 5;\n  return 6;', 
  'if (amount < 120000000) return 4;\n  return 5;');

fs.writeFileSync('client/src/components/Chips.tsx', content);
