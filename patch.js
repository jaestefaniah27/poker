const fs = require('fs');

let content = fs.readFileSync('client/src/components/Chips.tsx', 'utf8');

const newDefs = `  { v: 10000000, color: '#10b981', ring: '#064e3b', label: '10M', premium: 'diamond' },
  { v: 50000000, color: '#3b82f6', ring: '#1e3a8a', label: '50M', premium: 'diamond' },
  { v: 100000000, color: '#ec4899', ring: '#831843', label: '100M', premium: 'diamond'},
  { v: 500000000, color: '#000000', ring: '#ffffff', label: '500M', premium: 'diamond'},
  { v: 1000000000, color: '#facc15', ring: '#854d0e', label: '1B', premium: 'diamond'},
  { v: 5000000000, color: '#ef4444', ring: '#7f1d1d', label: '5B', premium: 'diamond'}
];`;

content = content.replace(/  \{ v: 5000000, color: '#f43f5e', ring: '#881337', label: '5M',   premium: 'diamond' \}\r?\n\];/s, 
  `  { v: 5000000, color: '#f43f5e', ring: '#881337', label: '5M',   premium: 'diamond' },\r\n${newDefs}`);

const newPages = `  [100000, 200000, 250000, 500000],
  [500000, 1000000, 2000000, 5000000],
  [5000000, 10000000, 50000000, 100000000, 500000000],
  [100000000, 500000000, 1000000000, 5000000000]
];`;

content = content.replace(/  \[100000, 200000, 250000, 500000\],\r?\n  \[500000, 1000000, 2000000, 5000000\],\r?\n\];/s, newPages);

content = content.replace(/if \(amount < 120000000\) return 4;\r?\n  return 5;/, 
  'if (amount < 10000000) return 4;\r\n  if (amount < 200000000) return 5;\r\n  return 6;');

fs.writeFileSync('client/src/components/Chips.tsx', content);
