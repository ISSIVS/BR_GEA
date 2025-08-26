// SecurOS 10.8  EventViewer HTML5 //

//Securos  Information
var Securos_Server_IP = "localhost";//"10.62.112.20";
//Rest Api credentials 
var RestApi_port = '8888';
var RestApi_user = 'adm';
var RestApi_pass = 'adm';

var mailfrom = "";
var mail_user = "";
var mail_pass = '';

//Dashboard Port #
var Server_port = 8333;
var integration_port = 3016;
//use this port to access via webbrowser to SecurOS EventViewer HTML5
//for Example http://127.0.0.1:8333


//Do not modify this part
exports.restapi_port = RestApi_port;
exports.restapi_user = RestApi_user;
exports.restapi_pass = RestApi_pass;
exports.ip   = Securos_Server_IP;
exports.serverPort = Server_port;
exports.integrationPort = integration_port;

exports.mailfrom = mailfrom;
exports.mail_user = mail_user;
exports.mail_pass = mail_pass;
