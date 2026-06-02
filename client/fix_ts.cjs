const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Fix myPlayer issues
content = content.replace(/\{myPlayer\?\.currentBet > 0 && \(/g, '{(myPlayer?.currentBet || 0) > 0 && (');
content = content.replace(/\{myPlayer\?\.chips <= toCallAmount \? \(/g, '{((myPlayer?.chips || 0) <= toCallAmount) ? (');
content = content.replace(/\{\(myPlayer\?\.chips \+ \(myPlayer\?\.currentBet \|\| 0\)\) > currentRoom\.highestBet && \(\(\) => \{/g, '{((myPlayer?.chips || 0) + (myPlayer?.currentBet || 0)) > currentRoom.highestBet && (() => {');
content = content.replace(/\{myPlayer\?\.cards\?\.length > 0 \? \(/g, '{((myPlayer?.cards?.length || 0) > 0) ? (');

fs.writeFileSync('src/App.tsx', content);
