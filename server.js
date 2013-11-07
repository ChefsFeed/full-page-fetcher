var sys = require("util"),
    url = require("url"),
    path = require("path"),
    http = require("http"),
    phantom = require('node-phantom');


function getParam(env_name) { return process.env[env_name]; }
function getIntParam(env_name) { return process.env[env_name] ? parseInt(process.env[env_name]) : undefined; }

var hostname =   getParam('FPF_HOSTNAME') || '127.0.0.1';
var port =    getIntParam('FPF_PORT') || 26000;
var timeOut = getIntParam('FPF_TIMEOUT_MS') || 10000;
var baseUrl =    getParam('FPF_BASE_URL') || 'http://www.google.com/';


var phantomOptions = {
  parameters: {
    'load-images': 'no',
    'local-to-remote-url-access' : 'yes'
  }
}

var renderHtml = function(url, cb) {
  phantom.create(function(err, ph) {
    ph.createPage(function(err, page){
      page.onConsoleMessage = function(msg, lineNum, sourceId) {
        var logLine = 'CONSOLE: ' + msg;
        if (lineNum)
          logLine += ' (from line #' + lineNum + ' in "' + sourceId + '")';
        console.log(logLine);
      };
      page.open(url, function(err, status){
        //on errors, stop here
        if (err) return cb(err);

        setTimeout(function() {
          if (err)
            cb(err);
          else
            page.get('content',function(err,content){ cb(null, content) });
        }, timeOut);
      });
    });
  }, phantomOptions);
};

var serverHandler = function(request, response) {
  var page = url.parse(request.url, true).pathname;
  var targetUrl = url.resolve(baseUrl, page);

  sys.puts("---- fetching: " + targetUrl);

  renderHtml(targetUrl, function(err, html) {
    if (err) {
      //hide it under the carpet
      //response.writeHead(500, {"Content-Type": "text/html"});
      //response.write(err);
      //response.end();

      //fail noisily
      sys.puts(" **** ERROR: "+err);
      //bail; it is assumed this script runs under supervision and is automatically restarted
      return exit(1);
    }
    else {
      response.writeHead(200, {"Content-Type": "text/html"});
      response.write(html);
      response.end();
    }
  });
};

var server = http.createServer(serverHandler);
server.listen(port, hostname);
sys.puts("Server running at http://"+hostname+":"+port+"/ - baseUrl: "+baseUrl);

