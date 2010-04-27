var sys = require("sys");
var workerpool = require("./workerpool");

var maths = new workerpool.WorkerPool("example-slave.js", {
		  timeout: 2000
		, minWorkers: 1
		, maxWorkers: 5
		, poolTimeout: 60000
	});

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
