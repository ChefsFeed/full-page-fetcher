var sys = require("util"),
    url = require("url"),
    http = require("http"),
    factory = require('node-phantom');

function getParam(env_name) { return process.env[env_name]; }
function getIntParam(env_name) { return process.env[env_name] ? parseInt(process.env[env_name]) : undefined; }

var hostname =   getParam('FPF_HOSTNAME') || '127.0.0.1';
var port =    getIntParam('FPF_PORT') || 26000;
var timeOut = getIntParam('FPF_TIMEOUT_MS') || 10000;
var baseUrl =    getParam('FPF_BASE_URL') || 'http://www.google.com/';
var selector =   getParam('FPF_WAIT_FOR_SELECTOR');

//region: misc stuff

var phantomOptions = {
  parameters: {
    'load-images': 'no',
    'local-to-remote-url-access' : 'yes'
  }
}

var logConsoleMessage = function(msg, lineNum, sourceId) {
  var logLine = 'CONSOLE: ' + msg;
  if (lineNum)
    logLine += ' (from line #' + lineNum + ' in "' + sourceId + '")';
  sys.puts(logLine);
};

//borrowed from phantom-proxy
var waitForSelector = function (page, selector, timeout, callbackFn) {
  var startTime = Date.now(),
    timeoutInterval = 150,
    timeout = timeout || 10000;

  //if evaluate succeeds, invokes callback w/ true, if timeout,
  // invokes w/ false, otherwise just exits
  testForSelector = function () {
    var elapsedTime = Date.now() - startTime;

    if (elapsedTime > timeout)
      return callbackFn(false);

    page.evaluate(
      function (selector) {
        return !!document.querySelector(selector);
      },
      function (selectorProducedResults) {
        if (selectorProducedResults)
          callbackFn(true);
        else
          setTimeout(testForSelector, timeoutInterval);
      }, selector);
  };

  setTimeout(testForSelector, timeoutInterval);
}

//endregion

var renderHtml = function(url, cb) {
  factory.create(function (err, phantom) {
    if (err) return cb(err);  //on errors, stop here

    phantom.createPage(function(err, page) {
      if (err) return cb(err);  //on errors, stop here

      page.onConsoleMessage = logConsoleMessage;
      page.open(url, function () {
        //if a CSS selector was configured, wait until it appears or until the timeout
        if (selector) {
          waitForSelector(page, selector, timeOut, function () {
            page.get('content', function(err, content) {
              phantom.exit();
              return cb(err, content);
            });
          });
        }
        //otherwise, fixed wait until timeout
        else {
          setTimeout(function() {
            page.get('content', function(err, content) {
              phantom.exit();
              return cb(err, content);
            });
          }, timeOut);
        }
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
      sys.puts(" **** ERROR: "+err.toString());  //fail noisily
      response.writeHead(500, {"Content-Type": "text/html"});
      response.write(err.toString());
    }
    else {
      response.writeHead(200, {"Content-Type": "text/html"});
      response.write(html);
      sys.puts("---- done");
    }

    response.end();
  });
};

var server = http.createServer(serverHandler);
server.listen(port, hostname);
sys.puts("Server running at http://"+hostname+":"+port+"/ - baseUrl: "+baseUrl);


// vim: set foldmarker=//region:,//endregion foldmethod=marker
