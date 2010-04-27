#NodeWorkerPool
A library for managing a pool of Node child processes

##Example
There are two parts to a worker pool implementation: the master (worker pool) and slave(s) (worker). The worker pool receives jobs, dispatches them to available workers, collects worker results, and dispatches the results.
In this example (available in the repo as example-master.js and example-slave.js), the worker pool implements a basic set of math operations.

###Worker Pool
The first thing to do is include the workerpool module:

	var sys = require("sys");
	var workerpool = require("./workerpool");
	
Next, an instance of the workerpool is created. The first argument is the filename of the script to run in the workers, the second parameter is an optional set of settings that tell the worker pool how to behave.

	var maths = new workerpool.WorkerPool("example-slave.js", {
			  timeout: 2000
			, minWorkers: 1
			, maxWorkers: 5
			, poolTimeout: 60000
		});

The optional settings for the worker pool are:

* timeout - Milliseconds the worker job is allowed run. If a job takes longer, the worker is killed. For no timeout, use 0 or null
* minWorkers - Minimum number of concurrent workers to maintain
* maxWorkers - Maximum number of concurrent workers to maintain
* poolTimeout - Frequency with which the worker pool should see if there are unused workers that can be killed off

Finally, we create a set of jobs to run. The key here is the "addJob()" method; the first parameter is the action the worker should perform, next is the data to be passed to the worker, the third parameter is the callback for when the job completes, and the final parameter is the optional job key. A job key allows duplicate jobs to be collapsed into a single running worker while still triggering all the callbacks when the worker completes. An example where job keys would be useful is with a worker pool that fetches URLs; by using the URL as the job key, concurrent requests for a URL will result in only one worker.

	[
		  { action: "add", data: { op1: 1, op2: 2 }, key: "1+2" }
		, { action: "sub", data: { op1: 2, op2: 10 }, key: "2-10" }
		, { action: "mul", data: { op1: 1.2, op2: 2.6 }, key: "1.2*2.6" }
		, { action: "div", data: { op1: 5, op2: 0.3 }, key: "5/0.3" }
		, { action: "foo", data: { op1: 2, op2: 3 }, key: "2?3" }
	].forEach( function (item, index, list) {
		var action = item.action + "(" + item.data.op1 + ", " + item.data.op2 + ")"
		for (var i = 0; i < 10; i++)
			maths.addJob(item.action, { op1: item.data.op1, op2: item.data.op2 }, function (err, result) {
				if (err) {
					sys.puts("Error [" + action + "]: " + sys.inspect(err, false, null));
				} else {
					sys.puts("Result [" + action + "]: " + sys.inspect(result, false, null));
				}
			}, item.key);
	});

###Worker
The first thing to do is include the workerpool module:

	var sys = require("sys");
	var workerpool = require("./workerpool");

The next step is to create a worker that will listen for job requests. The worker gets passed a handler, which will be called with the action to perform and the data to perform the action on. When the handler has a result to return, it calls saveResult() and if there's an error it calls saveError(). When the handler is complete, it then calls jobDone().

	var maths = new workerpool.Worker(function (action, data) {
		var self = this;
		var funcDone = function() {
			self.jobDone();
		}
	
		switch (action) {
			case "add":
				this.saveResult(data.op1 + data.op2);
				break;
	
			case "sub":
				this.saveResult(data.op1 - data.op2);
				break;
	
			case "mul":
				this.saveResult(data.op1 * data.op2);
				break;
	
			case "div":
				this.saveResult(data.op1 / data.op2);
				break;
	
			default:
				this.saveError({ error: 1, desc: "Unrecognized action: \"" + action + "\"" });
				break;
		}
	
		if ((Math.floor(Math.random() * 10) + 1) < 3) {
			process.exit(0);
		}
		else if ((Math.floor(Math.random() * 10) + 1) < 3) {
			setTimeout(funcDone, 5000);
		} else {
			setTimeout(funcDone, 500);
		}
	
	});

In this example, the worker also simulates random crashes and timeouts to illustrate how the worker pool handles them.
