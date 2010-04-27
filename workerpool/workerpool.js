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
var child_process = require("child_process");

function Worker (workerScript) {
	this.workerScript = workerScript;
	this.process = child_process.spawn("node", [this.workerScript]);
	var self = this;
	this.process.stdout.addListener('data', function (data) {
		self.buffer += data;
		self.processBuffer();
	});
	this.process.stderr.addListener('data', function (data) {
		sys.debug('worker stderr: ' + data);
	});
	this.process.addListener('exit', function (code) {
		sys.debug('worker process exited with code ' + code);
		if (self.timer) {
			clearTimeout(self.timer);
			self.timer = null;
		}
		if (self.jobCallback) {
			var callback = self.jobCallback;
			self.job = null;
			self.jobCallback = null;
			callback({ error: 1, desc: "job failed" }, null, true);
		}
	});
}
Worker.reOffset = /^(\d+)\n/m;
Worker.prototype.workerScript = "";
Worker.prototype.active = false;
Worker.prototype.process = null;
Worker.prototype.job = null;
Worker.prototype.jobCallback = null;
Worker.prototype.buffer = "";
Worker.prototype.resultLen = -1;
Worker.prototype.timer = null;
Worker.prototype.end = function Worker$end () {
//	sys.debug("Worker$end()");
	this.process.kill();
}
Worker.prototype.processBuffer = function Worker$processBuffer () {
	if (this.resultLen < 0) {
		var match = Worker.reOffset.exec(this.buffer);
		if (match) {
			this.buffer = this.buffer.substring(match[0].length);
			this.resultLen = parseInt(match[1]);
		}
	}
	if (this.resultLen <= this.buffer.length) {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.active = false;
		var result = this.buffer.substring(0, this.resultLen);
		this.buffer = this.buffer.substring(this.resultLen);
		this.resultLen = -1;
		this.job = null;
		var callback = this.jobCallback;
		this.jobCallback = null;
		result = JSON.parse(result);
		callback(result.error, result.result, false);
	}
}
Worker.prototype.writeJob = function Worker$writeJob (job, callback, timeout) {
	if (this.active)
		sys.debug("FUCK! writeJob() called on active worker");
	this.active = true;
	this.job = job;
	this.jobCallback = callback;
	timeout = parseInt(timeout);
	if (timeout) {
		var self = this;
		this.timer = setTimeout(function () {
			sys.debug("Worker timeout triggered");
			self.timer = null;
			if (self.jobCallback) {
				var callback = self.jobCallback;
				self.job = null;
				self.jobCallback = null;
				callback({ error: 1, desc: "job timed out" }, null, true);
			}
			self.end();
		}, timeout);
	}
	var data = JSON.stringify({ action: job.action, data: job.data });
	this.process.stdin.write(data.length + "\n" + data, "utf8");
}

function WorkerPool (workerScript, options) {
	this.workerScript = workerScript;
	options = options ? options : {};
	this.options = {
		  jobTimeout: isNaN(options.jobTimeout) ? 3000 : parseInt(options.jobTimeout)
		, minWorkers: isNaN(options.minWorkers) ? 5 : parseInt(options.minWorkers)
		, maxWorkers: isNaN(options.maxWorkers) ? 10 : parseInt(options.maxWorkers)
		, poolTimeout: isNaN(options.poolTimeout) ? 300000 : parseInt(options.poolTimeout)
	}
	this.jobs = [];
	this.keyedJobs = {};
	this.idleWorkers = [];
	this.activeWorkers = [];
	this.checkMinWorkers();
	this.checkMaxWorkers();
}
WorkerPool.reOffset = /^(\d+)\n/m;
WorkerPool.prototype.worker = null;
WorkerPool.prototype.workerBuffer = "";
WorkerPool.prototype.workerResultLen = -1;
WorkerPool.prototype.jobs = null;
WorkerPool.prototype.keyedJobs = null;
WorkerPool.prototype.workerScript = "";
WorkerPool.prototype.idleWorkers = null;
WorkerPool.prototype.activeWorkers = null;
WorkerPool.prototype.maxActiveWorkers = 0;
WorkerPool.prototype.poolTimer = null;
WorkerPool.prototype.checkMinWorkers = function WorkerPool$checkMinWorkers () {
	//TODO: handle throttling back
	while ((this.idleWorkers.length + this.activeWorkers.length) < this.options.minWorkers)
		this.addWorker();
	if (this.activeWorkers.length > this.maxActiveWorkers)
		this.maxActiveWorkers = this.activeWorkers.length;
}
WorkerPool.prototype.checkMaxWorkers = function WorkerPool$checkMaxWorkers () {
//	sys.debug("checkMaxWorkers:" + this.idleWorkers.length + ":" + this.activeWorkers.length + ":" + this.options.minWorkers + ":" + this.maxActiveWorkers);
	var self = this;
	this.poolTimer = setTimeout(function () {
		self.checkMaxWorkers();
	}, this.options.poolTimeout);
	if (this.idleWorkers.length)
		if ((this.idleWorkers.length + this.activeWorkers.length) > this.options.minWorkers)
			if ((this.idleWorkers.length + this.activeWorkers.length - 1) > this.maxActiveWorkers)
				this.idleWorkers.shift().end();
	this.maxActiveWorkers = 0;
}
WorkerPool.prototype.addWorker = function WorkerPool$addWorker() {
	if ((this.idleWorkers.length + this.activeWorkers.length) < this.options.maxWorkers)
		this.idleWorkers.push(new Worker(this.workerScript));
}
WorkerPool.prototype.getWorker = function WorkerPool$getWorker () {
	if (!this.idleWorkers.length)
		this.addWorker();

	if (!this.idleWorkers.length)
		return;

	var worker = this.idleWorkers.shift();
	this.activeWorkers.push(worker);

	return(worker);
}
WorkerPool.prototype.addJob = function WorkerPool$handleJob (action, data, callback, jobKey) {
	if (jobKey) {
		jobKey = action + "::" + jobKey
		if (!this.keyedJobs[jobKey]) {
			var self = this;
			this.keyedJobs[jobKey] = [];
			this.jobs.push({
				  action: action
				, data: data
				, callback: function (err, result) {
						self.keyedJobs[jobKey].forEach(function (callback, index, list) {
//							sys.debug("callback: " + index);
							callback(err, result);
						});
						delete self.keyedJobs[jobKey];
					}
			});
		}
		this.keyedJobs[jobKey].push(callback);
	} else {
		this.jobs.push({
			  action: action
			, data: data
			, callback: callback
		});
	}
	this.runJobs();
}
WorkerPool.prototype.pullWorker = function WorkerPool$pullWorker (worker, list) {
	for (var i = 0; i < list.length; i++) {
		if (worker === list[i]) {
			list.splice(i, 1)
			return(true);
		}
	}
	return(false);
}
WorkerPool.prototype.runJobs = function WorkerPool$runJobs () {
//	sys.debug("runJobs: " + this.idleWorkers.length + " : " + this.activeWorkers.length);
	this.checkMinWorkers();
	while (this.jobs.length) {
		var worker = this.getWorker();
		if (!worker)
			return;
		var self = this;
		var job = this.jobs.shift();
		try {
			var workerSelf = worker;
			worker.writeJob(job, function (err, result, aborted) {
				if (!(self.pullWorker(workerSelf, self.activeWorkers) || self.pullWorker(workerSelf, self.idleWorkers)))
					sys.debug("Failed to pull worker");
				job.callback(err, result);
				if (!aborted)
					self.idleWorkers.push(workerSelf);
				self.runJobs();
			}, this.options.jobTimeout); //TODO: job-level timeouts
		} catch (ex) {
			sys.debug("FUCK! " + ex + "\n" + sys.inspect(worker, false, null));
		}
	}
}
WorkerPool.prototype.jobDone = function WorkerPool$jobDone (workerResult) {
	this.runJobs();
}

exports.WorkerPool = WorkerPool;
