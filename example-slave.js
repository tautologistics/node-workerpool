var sys = require("sys");

var workerpool = require("./workerpool");

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
//		sys.debug("worker quitting!");
		process.exit(0);
	}
	else if ((Math.floor(Math.random() * 10) + 1) < 3) {
//		sys.debug("worker timing out!");
		setTimeout(funcDone, 5000);
	} else {
		setTimeout(funcDone, 500);
	}

});
