/***********************************************
Copyright 2010, Chris Winberry <chris@winberry.net>. All rights reserved.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
***********************************************/

var sys = require("sys");
var fs = require("fs");

function Worker (handler) {
	this.handler = handler;
	this.stdin = process.openStdin();
	this.stdin.setEncoding("utf8");
	var self = this;
	this.stdin.addListener('data', function (chunk) {
		self.inBuffer += chunk;
		if (self.dataLen < 0) {
			var match = Worker.reOffset.exec(self.inBuffer);
			if (match) {
				self.inBuffer = self.inBuffer.substring(match[0].length);
				self.dataLen = parseInt(match[1]);
			}
		}
		if ((self.dataLen > -1) && (self.dataLen <= self.inBuffer.length)) {
			var request = JSON.parse(self.inBuffer.substring(0, self.dataLen));
			self.inBuffer = self.inBuffer.substring(self.dataLen);
			self.dataLen = -1;
			self.handler(request.action, request.data);
		}
	});
	this.stdin.addListener('end', function () {
		sys.debug("STDIN (end)");
		process.exit(0);
	});
	this.stdin.addListener('error', function (err) {
		sys.debug("STDIN ERROR: (" + arguments.length + ") " +  sys.inspect(arguments, false, null));
		process.exit(1);
	});
}
Worker.reOffset = /^(\d+)\n/m;
Worker.prototype.handler = null;
Worker.prototype.inBuffer = "";
Worker.prototype.dataLen = -1;
Worker.prototype.result = "";
Worker.prototype.stdin = null;
Worker.prototype.jobDone = function Worker$jobDone () {
	this.writeResult();
}
Worker.prototype.writeResult = function Worker$writeResult () {
	process.stdout.write(this.result.length + "\n" + this.result);
	this.result = "";
}
Worker.prototype.saveError = function Worker$saveResult (jsonData) {
	try {
		this.result = JSON.stringify({ error: jsonData, result: null });
	} catch (ex) {
		this.saveResult({
			  error: 3
			, msg: "Error: error JSON data is not valid: " + ex
		});
	}
}
Worker.prototype.saveResult = function Worker$saveResult (jsonData) {
	try {
		this.result = JSON.stringify({ error: null, result: jsonData });
	} catch (ex) {
		this.saveResult({
			  error: 2
			, msg: "Error: result JSON data is not valid: " + ex
		});
	}
}

exports.Worker = Worker;
