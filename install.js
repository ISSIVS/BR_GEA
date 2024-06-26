var Service = require('node-windows').Service;

// Create a new service object
var svc = new Service({
     name:'SecurOS GEA Module',
     description: 'Module to Manage SecurOS Events, ',
     script: 'index.js'
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install',function() {
     svc.start();
});

svc.install();