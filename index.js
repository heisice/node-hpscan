const fs = require("fs");
const async = require("async");
const request = require("request");
const parseString = require("xml2js").parseString;

class ScanJob {
	
	constructor(props) {
		this.resolution = props && props.resolution || 300;
		this.page_width = props && props.page_width || 2550;
		this.page_height = props && props.page_height || 3300;
		this.scan_format = props && props.scan_format || 'Pdf';
		this.color_space = props && props.color_space || 'Gray';
		this.gamma = props && props.gamma || 1000;
		this.brightness = props && props.brightness || 1000;
		this.contrast = props && props.contrast || 1000;
		this.highlite = props && props.highlite || 179;
		this.shadow = props && props.shadow || 25;
	}

	xml() {

		let body = `<scan:ScanJob xmlns:scan="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19"
			xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
			<scan:XResolution>${this.resolution}</scan:XResolution>
			<scan:YResolution>${this.resolution}</scan:YResolution>
			<scan:XStart>0</scan:XStart>
			<scan:YStart>0</scan:YStart>
			<scan:Width>${this.page_width}</scan:Width>
			<scan:Height>${this.page_height}</scan:Height>
			<scan:Format>${this.scan_format}</scan:Format>
			<scan:CompressionQFactor>25</scan:CompressionQFactor>
			<scan:ColorSpace>${this.color_space}</scan:ColorSpace>
			<scan:BitDepth>8</scan:BitDepth>
			<scan:InputSource>Platen</scan:InputSource>
			<scan:GrayRendering>NTSC</scan:GrayRendering>
			<scan:ToneMap>
				<scan:Gamma>${this.gamma}</scan:Gamma>
				<scan:Brightness>${this.brightness}</scan:Brightness>
				<scan:Contrast>${this.contrast}</scan:Contrast>
				<scan:Highlite>${this.highlite}</scan:Highlite>
				<scan:Shadow>${this.shadow}</scan:Shadow>
			</scan:ToneMap>
			<scan:ContentType>Document</scan:ContentType>
		</scan:ScanJob>`;

		return body;
	}

}

class Scanner {

	constructor(hostname) {
		this.hostname = hostname;
	}

	endpoint(url, body, callback) {

		let req = body ? request.post : request.get;

		let headers = body ? {
			'Content-Type': 'text/xml',
			'Content-Length': Buffer.byteLength(body)
		} : {};

		req({url:`http://${this.hostname}/${url}`, headers:headers, body:body}, (err, res, xml) => {
			
			if (err) {
				callback(err);
				return;
			}

			if (res.statusCode == 201) {
				return callback(null);
			}

			parseString(xml, (err, result) => {

				if (err) {
					callback(err);
					return;
				}
				
				if (!xml) {
					callback(new Error('invalid response'));
					return;
				}

				callback(null, result);
			});
		});
	}

	status(callback) {
		this.endpoint("eSCL/ScannerStatus", null, (err, xml) => {
			
			if (err) {
				callback(err);
				return;
			}

			let status = xml["scan:ScannerStatus"];
			
			return callback(null, {
				version: status["pwg:Version"] && status["pwg:Version"][0] || "",
				state: status["pwg:State"] && status["pwg:State"][0] || "",
				adf: status["scan:AdfState"] && status["scan:AdfState"][0].replace("ScannerAdf","") || ""
			});
		})
	}

	recentScan(callback) {

		this.endpoint("Jobs/JobList", null, (err, xml) => {

			if (err) {
				callback(err);
				return;
			}

			let jobs = xml["j:JobList"]["j:Job"]
				.filter((x) => {
					return (
						x["j:JobCategory"] && x["j:JobCategory"][0] == "Scan" &&
						x["j:JobCategory"] && x["j:JobState"][0] != "Canceled"
					);
				})
				.slice(-1)
				.map((x) => {
					let pages = x["ScanJob"] && x["ScanJob"][0] && x["ScanJob"][0]["PreScanPage"]
					.map((x) => {
						return {
							page_total: x.PageNumber && x.PageNumber[0],
							page_state: x.PageState && x.PageState[0],
							binary_url: x.BinaryURL && x.BinaryURL[0],
							image_orientation: x.ImageOrientation && x.ImageOrientation[0]
						};
					});
					return {
						url: x["j:JobUrl"] && x["j:JobUrl"][0] || "",
						category: x["j:JobCategory"] && x["j:JobCategory"][0] || "",
						update: x["j:JobStateUpdate"] && x["j:JobStateUpdate"][0] || "",
						pages: pages
					};
				})
				.pop();
			
			if (jobs.pages[0].page_state != 'ReadyToUpload') {
				console.log("wait for upload...");
				setTimeout(() => {
					this.recentScan(callback);					
				}, 500);
				return;
			}

			return callback(null, jobs);
		});
	};

	prepareScan(callback) {

		let job = new ScanJob();

		this.endpoint("Scan/Jobs", job.xml(), (err) => {
			
			if (err) {
				callback(err);
				return;
			}

			return callback(null);
		});
	}

	scan(filename, callback) {

		this.prepareScan((err) => {

			if (err) {
				callback(err);
				return;
			}


			this.recentScan((err, result) => {

				if (err) {
					callback(err);
					return;
				}

				if (!result.pages)
					return callback(new Error('Scan failed.'));

				async.eachSeries(result.pages, (page, cb) => {
					
					if (page.page_state != "ReadyToUpload") {
						cb(new Error('not ready.'));
						return;
					}

					request.get({url:`http://${this.hostname}${page.binary_url}`, encoding:null}, (err, res, raw) => {
						if (err) return callback(err);
						if (res.statusCode == 200) {
							fs.writeFileSync(filename, raw);
							cb();
							return;
						}
						cb();
						return;
					});

				}, (error) => {
					callback(error);
					return;
				});

			});
		});
	}
}

module.exports = Scanner;
