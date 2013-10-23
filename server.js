var sys = require("sys"),
    url = require("url"),
    util = require("util"),
    path = require("path"),
    http = require("http");

var serverHandler = function(request, response) {
	  var query = url.parse(request.url, true).query;
    
    if (query.url != undefined) {
      sys.puts("fetching: " + query.url);
	    response.writeHead(200, {"Content-Type": "text/html"});
	    response.write("Hello World! (soon to be the actual content)");
    } else {
	    response.writeHead(404, {"Content-Type": "text/html"});
    };

	  response.end();
};

var server = http.createServer(serverHandler);

server.listen(6000);

sys.puts("Server running at http://localhost:6000/");
