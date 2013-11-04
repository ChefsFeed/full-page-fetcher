full-page-fetcher
=================

Description: Service that fetches pages from JS based apps, waiting for render to happen, and then returning. 

Disclaimer: Total work in progress. 

Requirements: Node, PhantomJS.

Usage:

1. npm install (installs node requirements)
2. install PhantomJS (depends on OS)
3. node server.js (see code for configuration options)

TODO:

* Handle errors
* Honour etags
* Cache content, based on headers. 

