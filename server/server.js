var http = require('http');
var express = require('express');
var util = require("gulp-util");

var Server = function(){
  this.initialize.apply(this, arguments);
};

var log = function(text, color){
  util.log(color(text));
};

var doAdd = function(a, b){
  return {
    type: "success",
    data: a + b
  };
};

var add = function(req, res){
  var result = {
    type: "error"
  };

  if(req.query != null){
    var a = Number(req.query.a);
    var b = Number(req.query.b);
    if(!isNaN(a) && !isNaN(b)){
      result = doAdd(a, b);
    }
  }
  res.send(result);
};


var subtract = function(req, res){
  var result = {
    type: "error"
  };

  if(req.query != null){
    var a = Number(req.query.a);
    var b = Number(req.query.b);
    if(!isNaN(a) && !isNaN(b)){
      result = doAdd(a, b * -1);
    }
  }
  res.send(result);
};

// URLのパスと、呼び出される関数の対応づけを行う関数
var initRouter = function(router, documentRoot){
  router.use(express.static(documentRoot));
  // どこにもマッチしないときはdocumentRootの値にあるフォルダの中身を返す
};

Server.prototype = {

  initialize: function(conf){
    this._port = conf.port || 8080;
    this._documentRoot = conf.documentRoot || process.cwd() + "/app";
    this._router = express();

    initRouter(this.router, this.documentRoot);
  },
  start: function(){
    this.engine.listen(this.port);
    this.log("Server started at http://localhost:" + this.port + "/");
    this.log("The document root is " + this.documentRoot);
  },
  log: function(text){
    log(text, util.colors.green);
  },
  warn: function(text){
    util.log(text, util.colors.yellow);
  },
  error: function(text){
    util.log(text, util.colors.red);
  },
  get router(){
    return this._router;
  },
  get engine(){
    return this._router;
  },
  get port(){
    return this._port;
  },
  get documentRoot(){
    return this._documentRoot;
  }
};

exports.create = function(conf){
  return new Server(conf);
};
