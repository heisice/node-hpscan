const Scanner = require("../");
const scanner = new Scanner("hp8851fb08c4f1.local");

scanner.status((error, result) => {

	if (error) {
		console.error(error);
		return;
	}

	if (result.state == "Idle") {

		if (error) {
			console.error(error);
			return;
		}

		scanner.scan("scan.pdf", (error) => {
			
			if (error) {
				console.error(error);
				return;
			}

			console.log('Scan completed.');
		});
		
		return;
	}
	
	console.error('Scanner is busy. (' + result.state + ')');
});
