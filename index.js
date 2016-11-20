var fs = require("fs");
var async = require("async");
var request = require("request");
var parseString = require("xml2js").parseString;

module.exports = HP_Scanner = function(hostname) {

	var parent = this;

	this.scanner_prefix = "http://" + hostname + "";

	this.status = function(callback) {
		request.get(parent.scanner_prefix + "/eSCL/ScannerStatus", function(err, res, xml) {
			if (err) return callback(err);
			parseString(xml, function(err, result) {
			  if (err) return callback(err);
			  var status = result["scan:ScannerStatus"];
			  if (!status) return callback(new Error("XML parse error."))
			  return callback(null, {
			  	version: status["pwg:Version"] && status["pwg:Version"][0] || "",
			  	state: status["pwg:State"] && status["pwg:State"][0] || "",
			  	adf: status["scan:AdfState"] && status["scan:AdfState"][0].replace("ScannerAdf","") || ""
			  });
			});
		});
	};

	this.recent_scan = function(callback) {
		request.get(parent.scanner_prefix + "/Jobs/JobList", function(err, res, xml) {
			if (err) return callback(err);
			parseString(xml, function(err, result) {
				if (err) return callback(err);
				var jobs = result["j:JobList"]["j:Job"];
				if (!jobs) return callback(new Error('XML parse error'));
				jobs = result["j:JobList"]["j:Job"]
				.filter(function(x) {
					return (
						x["j:JobCategory"] && x["j:JobCategory"][0] == "Scan" &&
						x["j:JobCategory"] && x["j:JobState"][0] != "Canceled"
					);
				})
				.slice(-1)
				.map(function(x) {
					var pages = x["ScanJob"] && x["ScanJob"][0] && x["ScanJob"][0]["PreScanPage"];
					pages = pages.map(function(x){
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
  				return callback(null, jobs);
			});
		});
	};

	this.prepare_scan = function(callback) {

		var body = ['<scan:ScanJob xmlns:scan="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">',
				'<scan:XResolution>300</scan:XResolution>', '<scan:YResolution>300</scan:YResolution>',
				'<scan:XStart>0</scan:XStart>', '<scan:YStart>0</scan:YStart>',
				'<scan:Width>2550</scan:Width>', '<scan:Height>3300</scan:Height>',
				'<scan:Format>Pdf</scan:Format>',
				'<scan:CompressionQFactor>25</scan:CompressionQFactor>',
				'<scan:ColorSpace>Gray</scan:ColorSpace>',
				'<scan:BitDepth>8</scan:BitDepth>',
				'<scan:InputSource>Platen</scan:InputSource>',
				'<scan:GrayRendering>NTSC</scan:GrayRendering>',
				'<scan:ToneMap>',
				'<scan:Gamma>1000</scan:Gamma>',
				'<scan:Brightness>1000</scan:Brightness>',
				'<scan:Contrast>1000</scan:Contrast>',
				'<scan:Highlite>179</scan:Highlite>',
				'<scan:Shadow>25</scan:Shadow>',
				'</scan:ToneMap>',
				'<scan:ContentType>Document</scan:ContentType>',
				'</scan:ScanJob>'].join("\n");
		var headers = {
			'Content-Type': 'text/xml',
			'Content-Length': Buffer.byteLength(body)
		};

		request.post({url:parent.scanner_prefix + "/Scan/Jobs", headers:headers, body:body}, function(err, res, body) {
			if (err) return callback(err);
			if (res.statusCode == 201) {
				return callback(null);
			}
			return callback(new Error(""+res.statusCode));
		});
	};

	this.scan = function(filename, callback) {

		parent.prepare_scan(function(error) {
			parent.recent_scan(function(err, result) {

				if (!result.pages)
					return callback(new Error('Scan failed.'));

				async.eachSeries(result.pages, function(page, cb) {
					if (page.page_state == "ReadyToUpload") {

						request.get({url:parent.scanner_prefix + page.binary_url, encoding:null}, function(err, res, raw) {
							if (err) return callback(err);
							if (res.statusCode == 200) {
								fs.writeFileSync(filename, raw);
								return cb();
							} 
							return cb();
						});			
					}
				}, function(error) {
					return callback(error);
				});

			});
		});

	};

};


