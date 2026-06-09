const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('poker.sqlite');

db.run("UPDATE users SET xp = 122500 WHERE name = 'Jorgerente' COLLATE NOCASE", function(err) {
  if (err) console.error(err);
  else console.log('Rows updated:', this.changes);
  db.close();
});
