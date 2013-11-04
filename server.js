var sys = require("util"),
    url = require("url"),
    path = require("path"),
    http = require("http"),
    phantom = require('node-phantom');

var hostname = process.env['FPF_HOSTNAME'] || '127.0.0.1';
var port =     process.env['FPF_PORT'] || '26000';
port = parseInt(port);

var baseUrl = process.argv[process.argv.length - 1];
var timeOut = 10000;
var phantomOptions = {
  parameters: {
    'load-images':  'no',
     'local-to-remote-url-access' : 'yes'
  }
}

var renderHtml = function(url, cb) {
    phantom.create(function(err, ph) {
      ph.createPage(function(err, page){
        page.onConsoleMessage = function(msg, lineNum, sourceId) {
          console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
        };
        page.open(url, function(err, status){
          setTimeout(function() {
            page.get('content',function(err,content){ cb(content) });
          }, timeOut);
        });
      });
    }, phantomOptions);
};

var serverHandler = function(request, response) {
	  var page = url.parse(request.url, true).pathname;
    var targetUrl = url.resolve(baseUrl, page);  
    sys.puts("fetching: " + targetUrl);
    response.writeHead(200, {"Content-Type": "text/html"});
    renderHtml(targetUrl, function(html) {
      response.write(html);
	    response.end();
    });

};

var server = http.createServer(serverHandler);
server.listen(port, hostname);
sys.puts("Server running at http://"+hostname+":"+port+"/");

