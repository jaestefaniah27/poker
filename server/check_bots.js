const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('/home/ubuntu/poker_repo/server/dist/server/poker.sqlite');
db.all("SELECT name, is_bot FROM users WHERE is_bot = 1", (err, rows) => {
  if (err) console.error(err);
  else console.log("Bots:", rows);
});
