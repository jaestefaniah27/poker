const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('/home/ubuntu/poker_repo/server/dist/server/poker.sqlite');
db.run("UPDATE users SET jackpot_unlock_level = 32 WHERE name='Israel'", (err) => {
  if (err) console.error(err);
  else console.log("Israel actualizado a nivel 32");
});
