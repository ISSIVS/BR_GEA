const { Pool, Client } = require("pg");

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT),
});

exports.query = function query(q, callback) {
    //console.log('QUERY:', q)
    pool.query(q, (err, res) => {
        if (err) {
            console.error(err.stack);
            //callback(err);
        } else {
            callback(res);
        }
    });
};
