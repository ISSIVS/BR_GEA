/* 
 *SECUROS NODEJS MODULES
 *@Author: Alejandro Garcia - alejandro@issivs.com
 *Version 1.0 
 *SecurOS 10.9
 *+-+-+-+-+-+-+-+ 
 *|I|N|T|E|G|R|A|T|I|O|N| |S|E|R|V|E|R| 
 *+-+-+-+-+-+-+-+ 
 *
 * require request Modu le - npm install --save request
**/
const request = require('request');

class integrationServer{
	constructor(ip,port)
	{
		this.ip = ip;
		this.port = port;
	}
	
	getObject(info,callback)
	{
        var json = {"id" : info.object_id,
                "type" :info.type}

        console.log("GetObject",json)
        console.log(`http://${this.ip}:${this.port}/api/securos/object`)
		var url = `http://${this.ip}:${this.port}/api/securos/object`
        
		const options = {
			url: url,
			method: 'POST',
			headers: {
				'Accept': 'application/json',
				'Accept-Charset': 'utf-8'
			},
            json : json
        };
        console.log("GetObject",json)
		request(options, function(err, res, body) {
            callback(body)})    

	}

	
 
}




exports.integrationServer = integrationServer; 