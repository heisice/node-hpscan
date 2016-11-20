var HP_Scanner = require("node-hpscan");

var scanner = new HP_Scanner("hp8851fb08c4f1.local");

scanner.status(function(err, result){

	if (result.state == "Idle") {

		scanner.scan("scan.pdf", function(error) {
			if (error) return console.error(error);
			console.log('Scan completed.');
		});
		
		return;
	}
	console.error('Scanner is busy. (' + result.state + ')');
});
