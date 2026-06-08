const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./poker.sqlite');
db.all('SELECT * FROM migrations', (err, rows) => console.log(err || rows));
