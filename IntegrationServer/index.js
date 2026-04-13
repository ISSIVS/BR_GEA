const http = require('http')
const express = require('express')
const app = express();
const server = http.createServer(app);

//settings
port = 3016;

//middlewares
app.use(express.urlencoded({extended:false}))
app.use(express.json());
//routes
app.use(require('./routes/api'))

//server is listenning
server.listen(port, function(){
console.log("Server init at ",port )

});
