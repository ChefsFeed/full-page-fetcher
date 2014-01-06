var sys = require("util"),
    url = require("url"),
    child_process = require("child_process"),
    path = require("path"),
    fs = require("fs"),
    http = require("http"),
    phantom = require('node-phantom');


function getParam(env_name) { return process.env[env_name]; }
function getIntParam(env_name) { return process.env[env_name] ? parseInt(process.env[env_name]) : undefined; }
function getBoolParam(env_name) { return process.env[env_name] == 'true'; }

var hostname =   getParam('FPF_HOSTNAME') || '127.0.0.1';
var port =    getIntParam('FPF_PORT') || 26000;
var timeOut = getIntParam('FPF_TIMEOUT_MS') || 10000;
var baseUrl =    getParam('FPF_BASE_URL') || 'http://www.google.com/';
var debug =  getBoolParam('FPF_DEBUG') || false;
var concurrency = getIntParam('FPF_CONCURRENCY') || 6;

//optionally, use disk caching in this path (based on URL path; DOES NOT expire, must be done manually)
var cachePath =  getParam('FPF_CACHE_PATH');

//optionally, poll for this CSS selector and finish as soon as it matches any element
var selector =   getParam('FPF_WAIT_FOR_SELECTOR');

//region: logging & misc

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
  console.log(logLine);
};

function log(message) {
  sys.puts(message);
}

function logBreak(message) {
  sys.puts("---- "+message);
}

function time(label) {
  console.time(label);
}

function timeEnd(label) {
  console.timeEnd(label);
}

function exec(command, cb) {
  child_process.exec(command, cb);
}

function mkdir_p_for_file(filepath, cb) {
  var command = 'mkdir -p `dirname '+filepath+'`';
  child_process.exec(command, cb);
}

function rand() {
  return Math.floor((Math.random()*10000)+1).toString();
}

//endregion

//region: async queue with capped concurrency

//source: https://journal.paul.querna.org/articles/2010/09/04/limiting-concurrency-node-js/

var maxClients = concurrency;
var currentClients = 0;
var pending = [];

function process_pending() {
  if (pending.length > 0) {
    var doWork = pending.shift();
    log('-- starting fetch with '+currentClients+' other concurrent fetches; queue length: '+pending.length);
    currentClients++;
    doWork(function() {
      currentClients--;
      process.nextTick(process_pending);
    });
  }
}

function client_limit(doWork) {
  if (currentClients < maxClients) {
    log('-- starting fetch with '+currentClients+' other concurrent fetches; queue length: '+pending.length);
    currentClients++;
    doWork(function() {
      currentClients--;
      process.nextTick(process_pending);
    });
  }
  else {
    pending.push(doWork);
    log('-- max fetch concurrency of '+concurrency+' reached; pending: '+pending.length);
  }
}

//endregion

//region: fetch from Ramen

var fetch = function(absoluteUrl, cb) {
  client_limit(function(done) {
    realFetch(absoluteUrl, function(content) {
      done();
      cb(content);
    });
  });
}

var realFetch = function(absoluteUrl, cb) {
  var startTime = Date.now();
  var remainingTimeout = 0;

  var label = 'fetch '+rand();
  time(label);
  log("fetching: " + absoluteUrl);

  function debugLog(message) {
    if (!debug) return;
    log("DEBUG req "+label+" - "+(Date.now() - startTime)+"ms - "+message);
  }

  debugLog('creating Phantom object...');
  phantom.create(function(err, phantomInstance) {
    var ph = phantomInstance;
    debugLog('Phantom object created');
    debugLog('creating Phantom page object...');
    ph.createPage(function(err, page){
      debugLog('Phantom page object created');
      page.onConsoleMessage = logConsoleMessage;
      debugLog('Phantom opening page...');
      page.open(absoluteUrl, function(err, status){
        remainingTimeout = parseInt(timeOut - (Date.now() - startTime));
        debugLog('Phantom page opened');

        //if a CSS selector was configured, wait until it appears or until the timeout
        if (selector) {
          var waitStart = Date.now();
          debugLog('Doing waitForSelector with timeout of '+timeOut+'...');
          waitForSelector(page, selector, timeOut, function (selectorMatched) {
            debugLog('wait over after '+(Date.now()-waitStart)+'ms; reason: '+(selectorMatched ? 'selector matched' : 'timeout waiting for selector match'));
            page.get('content', function(err, content) {
              ph.exit();
              return cb(content);
            });
          });
        }
        //otherwise, fixed wait until timeout
        else {
          debugLog('Setting fixed timeout of '+timeOut+'ms');
          setTimeout(function() {
            debugLog('Timeout reached');
            page.get('content', function(err, content) {
              ph.exit();
              return cb(content);
            });
          }, timeOut);
        }
      });
    });
  }, phantomOptions);
};

//borrowed from phantom-proxy
var waitForSelector = function (page, selector, timeout, callbackFn) {
  var startTime = Date.now();
  var timeoutInterval = 150;

  //if evaluate succeeds, invokes callback w/ true, if timeout,
  // invokes w/ false, otherwise just exits
  var testForSelector = function () {
    var elapsedTime = Date.now() - startTime;

    if (elapsedTime > timeout)
      return callbackFn(false);

    page.evaluate(
      function (selector) {
        return document.querySelector(selector);
      },
      function (err, selectorMatches) {
        if (selectorMatches) {
          console.log('selector matched: '+selectorMatches.outerHTML);
          callbackFn(true);
        }
        else
          setTimeout(testForSelector, timeoutInterval);
      }, selector);
  };

  setTimeout(testForSelector, timeoutInterval);
}

//endregion

//region: cache

function locationFor(urlPath, cb) {
  var fp = path.join(cachePath, urlPath);
  fp = fp.replace(/\/$/, '');
  fp += '.html';

  return fp;
}

function cacheLookup(urlPath, cb) {
  var filepath = locationFor(urlPath);

  fs.stat(filepath, function(err, exists) {
    if (exists)
      return fs.readFile(filepath, function(err, content) {
        return cb(null, content, filepath);
      });
    else
      return cb(null, null, filepath);
  });
}

function cacheStore(urlPath, html, cb) {
  var filepath = locationFor(urlPath);

  mkdir_p_for_file(filepath, function(err) {
    if (err) return cb(err);

    log('cache: storing '+filepath);
    return fs.writeFile(filepath, html, cb);
  });
}

function serve(html, response, cb) {
  response.writeHead(200, {"Content-Type": "text/html"});
  response.write(html);
  response.end();

  if (cb) return cb();
}

function serveWithCache(urlPath, absoluteUrl, realUrl, response, cb) {
  var mustKillCache = realUrl.indexOf('kill_cache=true') > 0;

  cacheLookup(urlPath, function(err, html, cachePath) {
    if (err) {
      log("ERROR: "+err.toString());
      return serve('', response, cb);
    }

    if (! html || mustKillCache) {
      var action = mustKillCache ? 'kill' : 'miss';
      log('cache '+action+': '+cachePath);

      fetch(absoluteUrl, function(html) {
        cacheStore(urlPath, html, function(err) {
          serve(html, response, cb);
        });
      });
    }
    else {
      log("cache hit: "+cachePath);
      serve(html, response, cb);
    }
  });
}

//endregion

var serverHandler = function(request, response) {
  var startTime = Date.now();

  var realUrl = request.url;
  var urlPath = url.parse(realUrl, true).pathname;
  var absoluteUrl = url.resolve(baseUrl, urlPath);

  var requestId = 'outer request '+rand();
  time(requestId);
  logBreak('begin request for '+urlPath);

  if (cachePath) {
    serveWithCache(urlPath, absoluteUrl, realUrl, response, function() {
      timeEnd(requestId);
      logBreak('end request for '+urlPath);
    });
  }
  else
    fetch(absoluteUrl, function(html) {
      serve(html, response, function() {
        timeEnd(requestId);
        logBreak('end request for '+urlPath);
      });
    });
};


//before starting, clean up phantomjs processes
exec('killall -9 phantomjs', function() {

  var server = http.createServer(serverHandler);
  server.listen(port, hostname);
  log("Server running at http://"+hostname+":"+port+"/ - baseUrl: "+baseUrl);

});

//vim: set foldmarker=//region:,//endregion foldmethod=marker

