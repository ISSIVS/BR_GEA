
const { Pool, Client } = require('pg')

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'securos',
  password: 'postgres',
  port: 5432,
})


exports.query = function query(q,callback) {
        //console.log('QUERY:', q)
        pool.query( q, (err, res) => {
            
		      	if (err) {
          
		    		console.error(err.stack);
		    		//callback(err);
		  		} else {
		    		callback(res);
		  		}       
         });
}
