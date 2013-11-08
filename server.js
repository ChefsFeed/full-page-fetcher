var sys = require("util"),
    url = require("url"),
    http = require("http"),
    factory = require('phantom-proxy');

function getParam(env_name) { return process.env[env_name]; }
function getIntParam(env_name) { return process.env[env_name] ? parseInt(process.env[env_name]) : undefined; }

var hostname =   getParam('FPF_HOSTNAME') || '127.0.0.1';
var port =    getIntParam('FPF_PORT') || 26000;
var timeOut = getIntParam('FPF_TIMEOUT_MS') || 10000;
var baseUrl =    getParam('FPF_BASE_URL') || 'http://www.google.com/';
var selector =   getParam('FPF_WAIT_FOR_SELECTOR');

var phantomOptions = {
  'load-images': 'no',
  'local-to-remote-url-access' : 'yes'
}

var logConsoleMessage = function(msg, lineNum, sourceId) {
  var logLine = 'CONSOLE: ' + msg;
  if (lineNum)
    logLine += ' (from line #' + lineNum + ' in "' + sourceId + '")';
  sys.puts(logLine);
};

var renderHtml = function(url, cb) {
  factory.create(phantomOptions, function (phantom) {
    var page = phantom.page;
    page.on('consoleMessage', logConsoleMessage);
    page.open(url, function () {
      //if a CSS selector was configured, wait until it appears or until the timeout
      if (selector) {
        page.waitForSelector(selector, function () {
          page.get('content', function(content) {
            phantom.end(function() {
              return cb(null, content);
            });
          });
        }, timeOut);
      }
      //otherwise, fixed wait until timeout
      else {
        setTimeout(function() {
          page.get('content', function(content) {
            phantom.end(function() {
              return cb(null, content);
            });
          });
        }, timeOut);
      }
    });
  });
};

var serverHandler = function(request, response) {
  var page = url.parse(request.url, true).pathname;
  var targetUrl = url.resolve(baseUrl, page);

  sys.puts("---- fetching: " + targetUrl);

  renderHtml(targetUrl, function(err, html) {
    if (err) {
      sys.puts(" **** ERROR: "+err.toString());  //fail noisily
      response.writeHead(500, {"Content-Type": "text/html"});
      response.write(err.toString());
    }
    else {
      response.writeHead(200, {"Content-Type": "text/html"});
      response.write(html);
    }

    response.end();
  });
};

var server = http.createServer(serverHandler);
server.listen(port, hostname);
sys.puts("Server running at http://"+hostname+":"+port+"/ - baseUrl: "+baseUrl);

