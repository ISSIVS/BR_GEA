/* 
 *SECUROS NODEJS MODULES
 *@Author: Alejandro Garcia - alejandro@issivs.com
 *Version 1.0 
 *SecurOS 10.7
 *+-+-+-+-+-+-+-+ 
 *|R|E|S|T|A|P|I| 
 *+-+-+-+-+-+-+-+ 
 *
 * require request Module - npm install --save request
**/
const request = require('request');

class restapi{
	constructor(ip,port,user,pass)
	{
		this.ip = ip;
		this.user = user;
		this.pass = pass;
		this.port = port;
	}
	
	getRequest(url,callback)
	{
		var username = this.user
		var password = this.pass
		var auth = 'Basic ' + new Buffer.from(username + ':' + password).toString('base64');
		var url = `http://${this.ip}:${this.port}/${url}`
		const options = {
			url: url,
			method: 'GET',
			headers: {
				'Accept': 'application/json',
				'Accept-Charset': 'utf-8',
				"Authorization": auth
			}
		};
		request(options, function(err, res, body) { callback(body)})

	}

	
 
}




exports.restapi = restapi; 