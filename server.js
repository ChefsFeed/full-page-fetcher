var sys = require("util"),
    url = require("url"),
    child_process = require("child_process"),
    path = require("path"),
    fs = require("fs"),
    http = require("http"),
    phantom = require('node-phantom');


function getParam(env_name) { return process.env[env_name]; }
function getIntParam(env_name) { return process.env[env_name] ? parseInt(process.env[env_name]) : undefined; }

var hostname =   getParam('FPF_HOSTNAME') || '127.0.0.1';
var port =    getIntParam('FPF_PORT') || 26000;
var timeOut = getIntParam('FPF_TIMEOUT_MS') || 10000;
var baseUrl =    getParam('FPF_BASE_URL') || 'http://www.google.com/';
var cachePath = getParam('FPF_CACHE_PATH');

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

//endregion

//region: fetch from Ramen

var fetch = function(absoluteUrl, cb) {
  var startTime = Date.now();

  log("fetching: " + absoluteUrl);

  time('fetch');
  phantom.create(function(err, phantomInstance) {
    var ph = phantomInstance;
    ph.createPage(function(err, page){
      page.onConsoleMessage = logConsoleMessage;
      page.open(absoluteUrl, function(err, status){
        setTimeout(function() {
          page.get('content',function(err,content){
            timeEnd('fetch');
            return cb(content);
          });
        }, timeOut);
      });
    });
  }, phantomOptions);
};

//endregion

//region: cache

function locationFor(urlPath, cb) {
  var fp = path.join(cachePath, urlPath);
  fp = fp.replace(/\/$/, '');
  fp += '.html';

  return fp;
}

function cacheLookup(urlPath, cb) {
  filepath = locationFor(urlPath);

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
  filepath = locationFor(urlPath);

  mkdir_p_for_file(filepath, function(err) {
    console.log(err);
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

  logBreak('begin request for '+urlPath);
  time('outer request');

  if (cachePath) {
    serveWithCache(urlPath, absoluteUrl, realUrl, response, function() {
      timeEnd('outer request');
      logBreak('end request for '+urlPath);
    });
  }
  else
    fetch(absoluteUrl, function(html) {
      serve(html, response, function() {
        timeEnd('outer request');
        logBreak('end request for '+urlPath);
      });
    });
};

var server = http.createServer(serverHandler);
server.listen(port, hostname);
log("Server running at http://"+hostname+":"+port+"/ - baseUrl: "+baseUrl);

//vim: set foldmarker=//region:,//endregion foldmethod=marker

