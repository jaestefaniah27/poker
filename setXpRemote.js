const sqlite3 = require('/home/ubuntu/poker_repo/server/node_modules/sqlite3');
const db = new sqlite3.Database('/home/ubuntu/poker_repo/server/dist/server/poker.sqlite');

db.run("UPDATE users SET xp = 122500 WHERE name = 'Jorge' COLLATE NOCASE", function(err) {
  if (err) console.error(err);
  else console.log('Rows updated:', this.changes);
  db.close();
});
